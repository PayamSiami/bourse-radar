/**
 * Bourse Radar — Data Ingestion Pipeline
 *
 * Fetches real TSE data from TSETMC + Codal.ir APIs and populates PostgreSQL:
 *   stocks → prices → monthly_sales → quarterly_financials → forward_pe → stock_rankings
 *
 * Usage:  node scripts/ingest.mjs          (run full pipeline)
 *         node scripts/ingest.mjs --help    (usage)
 *
 * Requires: DATABASE_URL in .env (or environment), Node ≥ 22.
 * Imports postgres from the project's node_modules via the package.json "imports" map.
 */

import "dotenv/config";
import postgres from "postgres";
import { writeFileSync } from "node:fs";

// ── Config ───────────────────────────────────────────────────────────
const DB_URL   = process.env.DATABASE_URL || "postgres://bourse:bourse123@localhost:5432/bourse_radar";
const UA       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
const TSETMC   = "https://cdn.tsetmc.com/api";
const CODAL    = "https://search.codal.ir/api/search";
const DELAY_MS = 350;          // 350 ms between requests (respect rate limits)
const MAX_SYMBOLS = 40;        // first N symbols to process

const SQL_HEADERS = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};
const CODAL_HEADERS = {
  ...SQL_HEADERS,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
  "Origin": "https://codal.ir",
  "Referer": "https://codal.ir/",
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const j2d   = (s) => { try { return JSON.parse(s); } catch { return null; } };

/** Fetch JSON from a URL with exponential-backoff retry.
 *  Codal/TSETMC occasionally reset connections (~5-8% under load). */
async function fetchJson(url, headers, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) { if (res.status === 429) throw new Error(`HTTP ${res.status}`); const j = await res.json(); return j; }
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(1500 * attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`fetch failed: ${String(lastErr)}`);
}

/** Fetch report HTML text with retry (transient ECONNRESET / fetch failed). */
async function fetchText(url, headers, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) { if (res.status === 429) throw new Error(`HTTP ${res.status}`); throw new Error(`HTTP ${res.status} ${url}`); }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(800 * attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`fetchText failed: ${String(lastErr)}`);
}

// ── TSE Major Symbols (fixed watchlist) ──────────────────────────────
//  Symbol :  Persian name, sector type hint
const WATCHLIST = [
  { sym: "فولاد",  name: "فولاد مبارکه اصفهان",  type: "general"  },
  { sym: "خودرو",  name: "ایران خودرو",           type: "general"  },
  { sym: "فولادمبارکه", name: "فولاد مبارکه",     type: "general"  },
  { sym: "فخوز",   name: "فولاد خوزستان",         type: "general"  },
  { sym: "فخاس",   name: "فولاد خراسان",          type: "general"  },
  { sym: "شپنا",   name: "پالایش نفت اصفهان",     type: "general"  },
  { sym: "شبندر",   name: "پالایش نفت بندر عباس",  type: "general"  },
  { sym: "شتران",   name: "پالایش نفت تهران",      type: "general"  },
  { sym: "شبریز",   name: "پالایش نفت تبریز",     type: "general"  },
  { sym: "پارسان",   name: "سهامی گسترش نفت و گاز پارسیان", type: "holding" },
  { sym: "obar",    name: "بیمه اتکایی امین",        type: "insurance" },
  { sym: "وبملت",   name: "بانک ملت",                type: "bank"    },
  { sym: "وبصادر",  name: "بانک صادرات",             type: "bank"    },
  { sym: "وپاسار",  name: "بانک پاسارگاد",          type: "bank"    },
  { sym: "شستا",    name: "سرمایه گذاری تأمین اجتماعی", type: "holding" },
  { sym: "خساپا",   name: "سایپا",                  type: "general"  },
  { sym: "خگستر",   name: "گسترش سرمایه گذاری ایران خودرو", type: "holding" },
  { sym: "فاسمین",  name: "فولاد امیر کبیر کاشان",  type: "general"  },
  { sym: "کگل",     name: "سنگ آهن گل گهر",         type: "general"  },
  { sym: "کمند",    name: "صندوق س. سرمایه گذاری کمند", type: "general" },
  { sym: "ذوب",     name: "ذوب آهن اصفهان",         type: "general"  },
  { sym: "فولاد",   name: "فولاد مبارکه",           type: "general"  },
  { sym: "میدکو",   name: "_medical_construction",   type: "general"  },
  { sym: "خپارس",   name: "پارس خودرو",             type: "general"  },
  { sym: "فولای",   name: "فولاد لاهیجان",          type: "general"  },
  { sym: "ارزش",    name: "سرمایه گذاری ارزش آفرینان", type: "holding" },
  { sym: "غپونه",   name: "کشت و صنعت پونه",        type: "general"  },
  { sym: "ගල",     name: " galan",                   type: "general"  },
].filter(s => s.sym && s.name && s.name.length > 2)
 .filter((s, i, a) => a.findIndex(x => x.sym === s.sym) === i); // dedupe

// ── Helpers ──────────────────────────────────────────────────────────
async function tsetmcGet(path) {
  const url = `${TSETMC}${path}`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: SQL_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!res.ok) { if (res.status === 429) throw new Error(`HTTP ${res.status}`); throw new Error(`TSETMC ${res.status}: ${path}`); }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}

// codalSearch retained for ad-hoc debugging; Phase 3 builds params inline.

async function codalSearch(symbol, letterType = -1) {
  const q = new URLSearchParams({
    Symbol: symbol, TracingNo: -1, LetterType: letterType, AuditorRef: -1,
    PageNumber: 1, Audited: true, NotAudited: true, IsNotAudited: false,
    Childs: true, Mains: true, Publisher: false, CompanyState: -1,
    ReportingType: -1, name: "", Length: -1, Category: -1, CompanyType: -1,
    Consolidatable: true, NotConsolidatable: true,
  });
  const res = await fetch(`${CODAL}/v2/q?${q}`, { headers: CODAL_HEADERS });
  if (!res.ok) throw new Error(`Codal ${res.status}`);
  return res.json();
}

/** Parse Jalali date "۱۴۰۵/۰۵/۳۱" → approximate Gregorian Date (days offset). */
function jalaliToGregorian(jy, jm, jd) {
  // Simplified Jalali→Gregorian: 621 years offset + month adjustments
  const gy = jy + 621;
  const monthDays = [0,31,31,31,31,31,31,30,30,30,30,30,29]; // for non-leap
  const leapDays  = [0,31,31,31,31,31,31,30,30,30,30,30,30];
  let jDayOfYear = 0;
  for (let m = 1; m < jm; m++) jDayOfYear += (jy % 4 === 3 ? leapDays : monthDays)[m];
  jDayOfYear += jd;
  // First 6 months = 31 days each, 2nd half of year is shorter
  // Approximation: subtract 79-80 days from spring equinox (March 21)
  const gDayOfYear = jDayOfYear + 79;
  const gMonthLengths = [31,28,31,30,31,30,31,31,30,31,30,31];
  if (gy % 4 === 0) gMonthLengths[1] = 29;
  let gMonth = 1, remaining = gDayOfYear;
  while (remaining > gMonthLengths[gMonth - 1] && gMonth < 12) {
    remaining -= gMonthLengths[gMonth - 1]; gMonth++;
  }
  return new Date(gy, gMonth - 1, remaining);
}

/** Convert Persian/Arabic digits (۰-۹, ٠-٩) to ASCII digits. */
function toAsciiDigits(s) {
  return s.replace(/[\u06F0-\u06F9]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x06F0 + 48))
          .replace(/[\u0660-\u0669]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 48));
}

/** Extract period-end date from Codal report title: "منتهی به ۱۴۰۵/۰۵/۳۱" */
function extractPeriodEnd(title) {
  const clean = toAsciiDigits(title);
  const m = clean.match(/منتهی\s+به\s+(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  const jy = parseInt(m[1]), jm = parseInt(m[2]), jd = parseInt(m[3]);
  return jalaliToGregorian(jy, jm, jd);
}

/** Extract monthly sales figure from Codal report HTML.
 *
 * The report page embeds a JS object `var datasource = {...}` containing
 * table definitions. The sales table ("تولید و فروش", metaTableCode 1197)
 * has rows per product and columns:
 *   col 3-6:  YTD تا پایان ماه قبل
 *   col 14-17: دوره یک ماهه (col17 = مبلغ فروش میلیون ریال) ← monthly!
 *   col 18-21: YTD تا پایان ماه جاری
 *
 * We find the total rows "جمع فروش داخلی" / "جمع فروش صادراتی" and read
 * their col=17 (one-month-period) value, summing for total monthly sales
 * in میلیون ریال.
 */
function extractMonthlySales(html) {
  // Find the sales table cells (metaTableCode 1197)
  const cells = extractCellsForTable(html, 1197);
  if (!cells || cells.length === 0) return null;

  // Find total rows
  const domesticLabel = cells.find(c => c.value === "جمع فروش داخلی");
  const exportLabel = cells.find(c => c.value === "جمع فروش صادراتی");

  let domestic = null, exported = null;
  if (domesticLabel) {
    const c = cells.find(x => x.rowCode === domesticLabel.rowCode && x.columnCode === 17 && /^\d+$/.test(x.value || ""));
    if (c) domestic = parseInt(c.value, 10);
  }
  if (exportLabel) {
    const c = cells.find(x => x.rowCode === exportLabel.rowCode && x.columnCode === 17 && /^\d+$/.test(x.value || ""));
    if (c) exported = parseInt(c.value, 10);
  }

  if (domestic != null && exported != null) return domestic + exported;
  if (domestic != null) return domestic;
  if (exported != null) return exported;

  // Fallback: sum all col-17 non-zero values for product rows (rowCode 4)
  const col17 = cells
    .filter(c => c.columnCode === 17 && c.rowCode === 4 && /^\d+$/.test(c.value || "") && parseInt(c.value, 10) > 0)
    .map(c => parseInt(c.value, 10));
  if (col17.length > 0) return col17.reduce((a, b) => a + b, 0);

  return null;
}

/** Build a structured monthly financial report from a Codal report HTML.
 *  Column layout (verified on خودرو 1405/05/31 report, 1167 cells):
 *    col1 شرح | col26 تولید/فروش
 *    col3  تعداد | col6 مبلغ (YTD تا ماه قبل)
 *    col7-9 اصلاحات
 *    col10/11 qty | col12/13 مبلق (YTD اصلاح شده)
 *    col14/15 qty | col16/17 مبلغ (دوره یک ماهه) ← monthly sales
 *    col18/19 qty | col20/21 مبلغ (YTD تا ماه جاری)
 *    col22/23 qty | col24/25 مبلغ (YTD سال قبل)
 *    col26 وضعیت
 *  rowCode: 4=product,5=جمع داخلی,8=جمع صادراتی,11=درآمد خدمات,14=برگشت,
 *           15=تخفیغات,16=جمع کل
 */
function extractMonthlyReport(html, title) {
  const cells = extractCellsForTable(html, 1197);
  if (!cells || cells.length === 0) return null;

  const num = (rc, col) => {
    const c = cells.find(x => x.rowCode === rc && x.columnCode === col);
    if (!c || !c.value || !/^-?\d+$/.test(c.value)) return null;
    return parseInt(c.value, 10);
  };
  const label = (rc) =>
    (cells.find(x => x.rowCode === rc && x.columnCode === 1)?.value || "").trim() ||
    (cells.find(x => x.rowCode === rc && x.columnCode === 26)?.value || "").trim();
  const toRow = (rc) => {
    if (!cells.some(x => x.rowCode === rc)) return null;
    return { rowCode: rc, label: label(rc),
      qtyPeriod: num(rc, 14), valuePeriod: num(rc, 17),
      qtyYtd: num(rc, 18), valueYtd: num(rc, 21),
      qtyPriorYtd: num(rc, 22), valuePriorYtd: num(rc, 25),
      rowTypeName: (cells.find(x => x.rowCode === rc)?.rowTypeName) || "" };
  };

  // Product rows grouped by rowSequence
  const goods = [];
  const seqs = new Set();
  for (const c of cells) if (c.rowCode === 4 && c.rowSequence !== undefined) seqs.add(c.rowSequence);
  for (const seq of seqs) {
    const rc2 = cells.filter(x => x.rowCode === 4 && x.rowSequence === seq);
    if (!rc2.length) continue;
    const g = (c) => { const x = rc2.find(y => y.columnCode === c); return x && x.value ? (/^-?\d+$/.test(x.value) ? parseInt(x.value,10) : null) : null; };
    goods.push({
      rowCode: 4,
      label: (rc2.find(x => x.columnCode === 26)?.value || rc2.find(x => x.columnCode === 1)?.value || "").trim(),
      qtyPeriod: g(14), valuePeriod: g(17), qtyYtd: g(18), valueYtd: g(21),
      qtyPriorYtd: g(22), valuePriorYtd: g(25),
      rowTypeName: rc2[0]?.rowTypeName || "",
    });
  }

  const totals = [];
  for (const rc of [5, 8, 11, 14, 15, 16]) { const r = toRow(rc); if (r) totals.push(r); }
  const monthlySalesTotal = extractMonthlySales(html);
  const totalRow = totals.find(t => t.rowCode === 16);
  const domRow = totals.find(t => t.rowCode === 5);
  const expRow = totals.find(t => t.rowCode === 8);

  const jalali = extractPeriodEnd(title);
  let periodEnd = null;
  if (jalali) periodEnd = `${jalali.getFullYear()}-${String(jalali.getMonth()+1).padStart(2,"0")}-${String(jalali.getDate()).padStart(2,"0")}`;
  return {
    periodEnd, goods, totals,
    monthlySalesTotal,
    ytdSalesTotal: totalRow?.valueYtd ?? null,
    priorYtdSalesTotal: totalRow?.valuePriorYtd ?? null,
    domesticMonthly: domRow?.valuePeriod ?? null,
    exportMonthly: expRow?.valuePeriod ?? null,
  };
}

/** Extract all cell objects for a given metaTableCode using brace-counting. */
function extractCellsForTable(html, metaTableCode) {
  // Find the "cells":[" array that belongs to this metaTableCode
  // First find all cells arrays and check which one belongs to this table
  const cellArrRe = /"cells":\[/g;
  let m;
  while ((m = cellArrRe.exec(html)) !== null) {
    // Check the first cell's metaTableCode
    const peek = html.slice(m.index + 9, m.index + 300);
    const metaMatch = peek.match(/"metaTableCode":(\d+)/);
    if (!metaMatch || parseInt(metaMatch[1]) !== metaTableCode) continue;

    const arrStart = m.index + 9; // after "cells":[
    const regionStart = arrStart;
    // Find each cell: {"metaTableId":
    const cells = [];
    let idx = 0;
    const region = html.slice(regionStart);
    while (true) {
      const p = region.indexOf('{"metaTableId":', idx);
      if (p === -1) break;
      // Brace-count from p to find closing }
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = p; i < region.length && i < p + 50000; i++) {
        const ch = region[i];
        if (esc) { esc = false; continue; }
        if (ch === "\\") { if (inStr) esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > p) {
        try {
          const obj = JSON.parse(region.slice(p, end));
          if (obj && typeof obj === "object" && obj.metaTableId !== undefined) cells.push(obj);
        } catch { }
      }
      idx = end > p ? end : p + 1;
    }
    if (cells.length > 0) return cells;
  }
  return null;
}

// ── Sector detection ─────────────────────────────────────────────────
function detectInstrumentFlags(type) {
  return {
    isBank: type === "bank",
    isInsurance: type === "insurance",
    isHoldingCompany: type === "holding",
    industryGroup: undefined,
    sectorAvgMargin: undefined,
  };
}

function sectorMarginFor(type) {
  if (type === "bank")      return 0.15;
  if (type === "insurance") return 0.08;
  if (type === "holding")   return 0.05;
  return 0.06;
}

// ── Forward P/E Computation (simplified from forward_pe.ts) ──────────
function computeForwardPE({ price, shares, monthlySalesReports, netMargin, flags }) {
  if (!price || price <= 0) return { pe: null, confidence: "non_calculable", eps: null };
  if (!shares || shares <= 0) return { pe: null, confidence: "non_calculable", eps: null };

  // Use last 3 months of sales
  const sorted = [...monthlySalesReports].sort((a, b) => new Date(b.month_end) - new Date(a.month_end));
  const last3 = sorted.slice(0, 3);
  if (last3.length === 0) return { pe: null, confidence: "non_calculable", eps: null };

  const avgSales = last3.reduce((s, r) => s + Number(r.sales_amount), 0) / last3.length;
  const annualizedSales = avgSales * 12; // already in millions

  const eps = (annualizedSales * 1_000_000 * netMargin) / shares;
  if (eps <= 0) return { pe: null, confidence: "non_calculable", eps: null };

  const pe = price / eps;

  // Confidence scoring (simplified)
  let score = 0;
  if (last3.length >= 3) score += 0.35;
  else if (last3.length >= 2) score += 0.25;
  else if (last3.length >= 1) score += 0.15;

  // Margin source quality
  if (!netMargin || netMargin <= 0) score += 0;
  else score += 0.15; // default sector margin

  // Instrument class penalty
  if (flags.isBank) score *= 0.85;
  if (flags.isInsurance) score *= 0.80;
  if (flags.isHoldingCompany) score *= 0.75;

  const confidence = score >= 0.75 ? "high" : score >= 0.40 ? "medium" : "low";
  const method = `codal_monthly_sales_${last3.length}mo_margin_default`;
  const disclaimer = `برآورد بر اساس ${last3.length} گزارش فروش ماهانه کدال و حاشیه سود پیش‌فرض صنعتی. ⚠️ این یک برآورد است.`;

  return {
    pe: Math.round(pe * 100) / 100,
    eps: Math.round(eps * 100) / 100,
    confidence,
    confidenceScore: Math.round(Math.min(score, 1.0) * 10000) / 10000,
    method,
    disclaimer,
    avgSales,
    marginUsed: netMargin,
  };
}

// ── Main Pipeline ────────────────────────────────────────────────────
async function main() {
  const sql = postgres(DB_URL, { max: 5 });
  console.log("Connected to PostgreSQL.\n");

  // ─── PHASE 1: Fetch TSETMC stock data + prices ────────────────────
  console.log(`=== PHASE 1: Fetching TSETMC data for ${WATCHLIST.length} symbols ===\n`);
  const stockData = [];

  for (const item of WATCHLIST) {
    const { sym, name, type } = item;
    try {
      // 1. Search for insCode
      const search = await tsetmcGet(`/Instrument/GetInstrumentSearch/${encodeURIComponent(sym)}`);
      const match = (search.instrumentSearch || []).find(
        i => i.lVal18AFC === sym || i.lVal30.includes(name)
      );
      if (!match) { console.log(`  [${sym}] No TSETMC match — skipped`); continue; }
      const insCode = match.insCode;

      await sleep(DELAY_MS);

      // 2. Instrument info
      const info = await tsetmcGet(`/Instrument/GetInstrumentInfo/${insCode}`);
      const inst = info.instrumentInfo || {};
      const shares = inst.zTitad || 0;
      const sectorName = inst.sector?.lSecVal || "";
      const estimatedEps = inst.eps?.estimatedEPS ? parseFloat(inst.eps.estimatedEPS) : null;
      const sectorPE = inst.eps?.sectorPE || null;
      const psr = inst.eps?.psr || null;
      const isin = inst.cIsin || "";

      await sleep(DELAY_MS);

      // 3. Closing price
      const priceRes = await tsetmcGet(`/ClosingPrice/GetClosingPriceInfo/${insCode}`);
      const cp = priceRes.closingPriceInfo || {};
      const lastPrice = cp.pDrCotVal || cp.pClosing || 0;
      const volume = cp.qTotTran5J || 0;
      const value = cp.qTotCap || 0;
      const changePct = cp.priceYesterday ? ((lastPrice - cp.priceYesterday) / cp.priceYesterday * 100) : 0;

      console.log(`  [${sym}] ✓ price=${lastPrice} vol=${volume} shares=${shares} sector=${sectorName}`);
      stockData.push({
        symbol: sym, name, insCode, isin, type, sectorName,
        shares, lastPrice, volume, value, changePct,
        estimatedEps, sectorPE, psr,
      });

      await sleep(DELAY_MS);
    } catch (e) {
      console.error(`  [${sym}] ✗ Error: ${e.message}`);
    }
  }

  console.log(`\nFetched ${stockData.length} stocks from TSETMC.\n`);

  // ─── PHASE 2: Insert stocks + prices into DB ──────────────────────
  console.log("=== PHASE 2: Inserting stocks + prices into DB ===\n");

  for (const s of stockData) {
    // Upsert stock
    await sql`
      INSERT INTO stocks (symbol, name, sector, isin, shares_outstanding,
                          is_bank, is_insurance, is_holding_company, updated_at)
      VALUES (${s.symbol}, ${s.name}, ${s.sectorName}, ${s.isin}, ${s.shares},
              ${s.type === "bank"}, ${s.type === "insurance"}, ${s.type === "holding"}, NOW())
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name, sector = EXCLUDED.sector, isin = EXCLUDED.isin,
        shares_outstanding = EXCLUDED.shares_outstanding,
        is_bank = EXCLUDED.is_bank, is_insurance = EXCLUDED.is_insurance,
        is_holding_company = EXCLUDED.is_holding_company, updated_at = NOW()
    `;

    // Insert current price
    if (s.lastPrice > 0) {
      await sql`
        INSERT INTO prices (symbol, timestamp, last_price, volume, value, change_percent)
        VALUES (${s.symbol}, NOW(), ${s.lastPrice}, ${s.volume}, ${s.value}, ${s.changePct})
      `;
    }
  }
  console.log(`Inserted ${stockData.length} stocks and prices.\n`);

  // ─── PHASE 3: Fetch Codal monthly sales ───────────────────────────
  console.log("=== PHASE 3: Fetching Codal monthly sales reports ===\n");

  let salesCount = 0;
  for (const s of stockData) {
    try {
      const codalQ = new URLSearchParams({
        Symbol: s.symbol, TracingNo: -1, LetterType: -1, AuditorRef: -1,
        PageNumber: 1, Audited: true, NotAudited: true, IsNotAudited: false,
        Childs: true, Mains: true, Publisher: false, CompanyState: -1,
        ReportingType: -1, name: "", Length: -1, Category: -1, CompanyType: -1,
        Consolidatable: true, NotConsolidatable: true,
      });
      const letters = await fetchJson(`${CODAL}/v2/q?${codalQ}`, CODAL_HEADERS);
      const monthlyLetters = (letters.Letters || []).filter(
        l => (l.Title || "").includes("فعالیت ماهانه") && !(l.Title || "").includes("اصلاحیه")
      );

      // Take the 3 most recent monthly reports
      for (const letter of monthlyLetters.slice(0, 3)) {
        const periodEnd = extractPeriodEnd(letter.Title);
        if (!periodEnd) continue;

        // Fetch the report HTML (retry on transient resets)
        const reportUrl = `https://codal.ir${letter.Url.startsWith("/") ? letter.Url : "/" + letter.Url}`;
        let html, salesAmount, detail;
        try {
          html = await fetchText(reportUrl, { ...CODAL_HEADERS, Accept: "text/html,application/xhtml+xml" });
        } catch (e) {
          console.warn(`  [${s.symbol}] ⚠ report fetch retry exhausted for ${reportUrl.slice(0,80)}: ${e.message.slice(0,80)}`);
          await sleep(DELAY_MS);
          continue; // move to next letter, don't fail the whole symbol
        }
        salesAmount = extractMonthlySales(html);
        detail = salesAmount ? extractMonthlyReport(html, letter.Title) : null;

        if (salesAmount && salesAmount > 0) {
          const monthEnd = periodEnd.toISOString().split("T")[0];

          await sql`
            INSERT INTO monthly_sales (symbol, month_end, sales_amount, is_estimated, source_url, fetched_at, detail)
            VALUES (${s.symbol}, ${monthEnd}, ${salesAmount}, false, ${reportUrl}, NOW(), ${detail})
            ON CONFLICT (symbol, month_end) DO UPDATE SET
              sales_amount = EXCLUDED.sales_amount,
              source_url = EXCLUDED.source_url,
              fetched_at = NOW(),
              detail = EXCLUDED.detail
          `;
          salesCount++;
          console.log(`  [${s.symbol}] ✓ Sales for ${monthEnd}: ${salesAmount} million Rial (${detail ? `YTD=${detail.ytdSalesTotal}` : "no detail"})`);
        }

        await sleep(DELAY_MS);
      }

      await sleep(DELAY_MS);
    } catch (e) {
      const msg = (e && e instanceof Error) ? e.message : String(e);
      console.error(`  [${s.symbol}] ✗ Codal error: ${msg}`);
    }
  }
  console.log(`\nInserted ${salesCount} monthly sales records.\n`);

  // ─── PHASE 4: Compute Forward P/E ─────────────────────────────────
  console.log("=== PHASE 4: Computing Forward P/E ===\n");

  let peCount = 0;
  for (const s of stockData) {
    // Fetch monthly sales for this symbol
    const salesRows = await sql`
      SELECT month_end, sales_amount FROM monthly_sales
      WHERE symbol = ${s.symbol}
      ORDER BY month_end DESC LIMIT 6
    `;

    const flags = detectInstrumentFlags(s.type);
    const margin = sectorMarginFor(s.type);

    const result = computeForwardPE({
      price: s.lastPrice,
      shares: s.shares,
      monthlySalesReports: salesRows,
      netMargin: margin,
      flags,
    });

    if (result.pe != null && result.pe > 0) {
      const now = new Date().toISOString();
      await sql`
        INSERT INTO forward_pe (symbol, calculated_at, estimated_annual_eps, forward_pe,
                                confidence, confidence_score, method, margin_used, disclaimer, calculation_json)
        VALUES (${s.symbol}, NOW(), ${result.eps}, ${result.pe},
                ${result.confidence}, ${result.confidenceScore}, ${result.method},
                ${result.marginUsed}, ${result.disclaimer},
                ${JSON.stringify({ salesReportsUsed: salesRows.length, sectorPE: s.sectorPE, estimatedEps: s.estimatedEps })})
      `;
      console.log(`  [${s.symbol}] ✓ Forward P/E = ${result.pe} (${result.confidence})`);
      peCount++;
    } else {
      await sql`
        INSERT INTO forward_pe (symbol, calculated_at, estimated_annual_eps, forward_pe,
                                confidence, confidence_score, method, disclaimer)
        VALUES (${s.symbol}, NOW(), null, null,
                'non_calculable', 0, 'non_calculable',
                'داده‌های فروش ماهانه کدال موجود نیست. P/E Forward غیرقابل محاسبه.')
      `;
      console.log(`  [${s.symbol}] △ non_calculable`);
    }

    // Prune: keep only the latest 30 forward_pe snapshots per symbol
    await sql`
      DELETE FROM forward_pe
      WHERE symbol = ${s.symbol}
        AND calculated_at NOT IN (
          SELECT calculated_at FROM forward_pe
          WHERE symbol = ${s.symbol} ORDER BY calculated_at DESC LIMIT 30
        )
    `;

    // Insert quarterly financials placeholder (from TSETMC estimated EPS)
    if (s.estimatedEps && s.lastPrice > 0 && s.shares > 0) {
      await sql`
        INSERT INTO quarterly_financials (symbol, fiscal_year, quarter, period_end,
                                          net_profit, net_margin, shares_outstanding, source_url, fetched_at)
        VALUES (${s.symbol}, EXTRACT(YEAR FROM NOW())::int, 4, CURRENT_DATE - INTERVAL '30 days',
                ${s.estimatedEps * s.shares / 1e6}, ${margin}, ${s.shares},
                'https://cdn.tsetmc.com', NOW())
        ON CONFLICT (symbol, fiscal_year, quarter) DO UPDATE SET
          net_profit = EXCLUDED.net_profit, net_margin = EXCLUDED.net_margin,
          shares_outstanding = EXCLUDED.shares_outstanding, fetched_at = NOW()
      `;
    }
  }
  console.log(`\nComputed Forward P/E for ${peCount} stocks.\n`);

  // ─── PHASE 5: Refresh Materialized View ───────────────────────────
  console.log("=== PHASE 5: Refreshing stock_rankings materialized view ===");
  await sql`REFRESH MATERIALIZED VIEW stock_rankings`;
  console.log("✓ Done.\n");

  // ─── Summary ──────────────────────────────────────────────────────
  const counts = await sql`
    SELECT
      (SELECT count(*) FROM stocks) AS stocks,
      (SELECT count(*) FROM prices) AS prices,
      (SELECT count(*) FROM monthly_sales) AS monthly_sales,
      (SELECT count(*) FROM quarterly_financials) AS quarterly_fin,
      (SELECT count(*) FROM forward_pe) AS forward_pe,
      (SELECT count(*) FROM stock_rankings) AS rankings
  `;
  console.log("=== Summary ===");
  console.log(counts[0]);
  console.log("\nDone! Server should now show data on /api/stocks and /api/rankings.");

  await sql.end();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

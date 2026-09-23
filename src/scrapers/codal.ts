/**
 * Codal.ir Scraper
 *   - Monthly sales reports (گزارش فعالیت ماهانه, LetterType 58)
 *   - Quarterly income statements (صورت سود و زیان, LetterType 6)
 *
 * Monthly reports embed `var datasource = {...}` with a `cells` array.
 * Quarterly reports render the income statement as plain HTML after an
 * ASP.NET postback that selects "صورت سود و زیان" from `#ctl00_ddlTable`.
 * A plain fetch returns the shell page (نظر حسابرس) with no table, so
 * quarterly income statements require a real browser (Playwright).
 *
 * All dates from Codal use Persian digits (۰-۹); we normalize to ASCII.
 */

import { chromium, type Browser } from "playwright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

const CODAL_SEARCH = "https://search.codal.ir/api/search";
const CODAL_BASE = "https://www.codal.ir";

const H = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
  Origin: "https://codal.ir",
  Referer: "https://codal.ir/",
};

// ═══════════════════════════════════════════════════════════════
// Browser singleton — for quarterly income statements only
// ═══════════════════════════════════════════════════════════════

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      channel: "chrome", // fallback: "msedge"
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CodalLetter {
  tracingNo: number;
  symbol: string;
  companyName: string;
  title: string;
  letterCode: string;
  publishDateTime: string;
  url: string;
  hasHtml: boolean;
  hasPdf: boolean;
  hasExcel: boolean;
}

export interface QuarterlyFinancials {
  periodEnds: string[];
  revenues: Array<number | null>;
  netProfits: Array<number | null>;
  eps: Array<number | null>;
  capitals: Array<number | null>;
  margins: Array<number | null>;
  latestMargin: number | null;
  latestPeriod: string | null;
  sharesOutstanding: number | null;
}

export interface QuarterlyResult {
  latestPeriod: string | null;
  latestMargin: number | null;
  financials: QuarterlyFinancials;
  reportUrl: string;
}

export interface MonthlySalesRow {
  rowCode: number;
  label: string;
  qtyPeriod: number | null;
  valuePeriod: number | null;
  qtyYtd: number | null;
  valueYtd: number | null;
  qtyPriorYtd: number | null;
  valuePriorYtd: number | null;
  rowTypeName: string;
}

export interface MonthlyReportResult {
  periodEnd: { jy: number; jm: number; jd: number };
  amount: number;
  reportUrl: string;
  detail: ReturnType<typeof extractMonthlyReport> | null;
}

interface CellRecord {
  metaTableId: number;
  metaTableCode: number;
  address: string;
  rowCode: number;
  rowSequence: number;
  columnCode: number;
  rowTypeName: string;
  value: string;
  formula?: string;
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

/** Persian/Arabic-Indic digits → ASCII */
export function toAsciiDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x06f0 + 48),
    )
    .replace(/[\u0660-\u0669]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 48),
    );
}

/** Parse "منتهی به ۱۴۰۵/۰۵/۳۱" from a title. */
export function extractJalaliPeriodEnd(
  title: string,
): { jy: number; jm: number; jd: number } | null {
  const clean = toAsciiDigits(title);
  const m = clean.match(/منتهی\s+به\s+(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return { jy: parseInt(m[1]!), jm: parseInt(m[2]!), jd: parseInt(m[3]!) };
}

// ═══════════════════════════════════════════════════════════════
// Search API
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SEARCH = {
  TracingNo: "-1",
  LetterCode: null,
  LetterType: "-1",
  FromDate: null,
  ToDate: null,
  Isic: null,
  AuditorRef: "-1",
  YearEndToDate: null,
  PageNumber: "1",
  Audited: "true",
  NotAudited: "true",
  IsNotAudited: "false",
  Childs: "true",
  Mains: "true",
  Publisher: "false",
  CompanyState: "-1",
  ReportingType: "-1",
  name: "",
  Length: "-1",
  Category: "-1",
  CompanyType: "-1",
  Consolidatable: "true",
  NotConsolidatable: "true",
};

export async function searchLetters(
  symbol: string,
  opts: Record<string, unknown> = {},
): Promise<CodalLetter[]> {
  const model: Record<string, unknown> = {
    Symbol: symbol,
    ...DEFAULT_SEARCH,
    ...opts,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(model)) {
    if (v === null || v === undefined || v === "") continue;
    q.append(k, String(v));
  }
  const res = await fetch(`${CODAL_SEARCH}/v2/q?${q.toString()}`, {
    headers: H,
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new Error(`Codal ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { Letters?: Record<string, unknown>[] };
  return (data.Letters ?? []).map((l) => ({
    tracingNo: Number(l.TracingNo ?? 0),
    symbol: String(l.Symbol ?? ""),
    companyName: String(l.CompanyName ?? ""),
    title: String(l.Title ?? ""),
    letterCode: String(l.LetterCode ?? ""),
    publishDateTime: String(l.PublishDateTime ?? ""),
    url: String(l.Url ?? ""),
    hasHtml: Boolean(l.HasHtml),
    hasPdf: Boolean(l.HasPdf),
    hasExcel: Boolean(l.HasExcel),
  }));
}

export function filterMonthlySalesLetters(
  letters: CodalLetter[],
): CodalLetter[] {
  return letters.filter(
    (l) => l.title.includes("فعالیت ماهانه") && !l.title.includes("اصلاحیه"),
  );
}

// ═══════════════════════════════════════════════════════════════
// Monthly report parsing (datasource JSON)
// ═══════════════════════════════════════════════════════════════

function extractCellsForTable(
  html: string,
  metaTableCode: number,
): CellRecord[] {
  const re = /"cells":\[/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const peek = html.slice(m.index + 9, m.index + 300);
    const metaMatch = peek.match(/"metaTableCode":(\d+)/);
    if (!metaMatch || parseInt(metaMatch[1]!) !== metaTableCode) continue;
    const arrStart = m.index + 9;
    const cells = parseCellsArray(html.slice(arrStart));
    if (cells.length > 0) return cells;
  }
  return [];
}

function parseCellsArray(rawArray: string): CellRecord[] {
  const cells: CellRecord[] = [];
  let idx = 0;
  while (true) {
    const p = rawArray.indexOf('{"metaTableId":', idx);
    if (p === -1) break;

    let depth = 0,
      inStr = false,
      esc = false,
      end = -1;
    for (let i = p; i < rawArray.length && i < p + 50000; i++) {
      const ch = rawArray[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        if (inStr) esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > p) {
      const cellStr = rawArray.slice(p, end);
      try {
        const obj = JSON.parse(cellStr);
        if (obj && typeof obj === "object" && obj.metaTableId !== undefined) {
          cells.push(obj);
        }
      } catch {
        /* skip */
      }
      idx = end;
    } else {
      idx = p + 1;
    }
  }
  return cells;
}

export function extractMonthlySalesAmount(html: string): number | null {
  const cells = extractCellsForTable(html, 1197);
  if (cells.length === 0) return null;

  const domesticLabel = cells.find((c) => c.value === "جمع فروش داخلی");
  const exportLabel = cells.find((c) => c.value === "جمع فروش صادراتی");

  const findMonthlyAmount = (rowCode: number | undefined) => {
    if (rowCode === undefined) return null;
    const cell = cells.find(
      (c) =>
        c.rowCode === rowCode &&
        c.columnCode === 17 &&
        /^\d+$/.test(c.value ?? ""),
    );
    return cell ? parseInt(cell.value!, 10) : null;
  };

  let total = 0;
  let found = false;
  const d = findMonthlyAmount(domesticLabel?.rowCode);
  const e = findMonthlyAmount(exportLabel?.rowCode);
  if (d !== null) {
    total += d;
    found = true;
  }
  if (e !== null) {
    total += e;
    found = true;
  }
  if (found) return total;

  const productSales = cells
    .filter(
      (c) =>
        c.columnCode === 17 &&
        c.rowCode === 4 &&
        /^\d+$/.test(c.value ?? "") &&
        parseInt(c.value, 10) > 0,
    )
    .map((c) => parseInt(c.value, 10));
  if (productSales.length > 0) return productSales.reduce((a, b) => a + b, 0);

  const allCol17 = cells
    .filter((c) => c.columnCode === 17 && /^\d+$/.test(c.value ?? ""))
    .map((c) => parseInt(c.value, 10));
  if (allCol17.length > 0) return Math.max(...allCol17);

  return null;
}

export function extractMonthlyReport(
  html: string,
  title: string,
): {
  periodEnd: string | null;
  goods: MonthlySalesRow[];
  totals: MonthlySalesRow[];
  monthlySalesTotal: number | null;
  ytdSalesTotal: number | null;
  priorYtdSalesTotal: number | null;
  domesticMonthly: number | null;
  exportMonthly: number | null;
} | null {
  const cells = extractCellsForTable(html, 1197);
  if (cells.length === 0) return null;

  const val = (rc: number, col: number): number | null => {
    const cell = cells.find((c) => c.rowCode === rc && c.columnCode === col);
    if (!cell || !cell.value) return null;
    const s = cell.value.trim();
    if (!/^-?\d+$/.test(s)) return null;
    return parseInt(s, 10);
  };
  const label = (rc: number): string =>
    cells.find((c) => c.rowCode === rc && c.columnCode === 1)?.value?.trim() ??
    cells.find((c) => c.rowCode === rc && c.columnCode === 26)?.value?.trim() ??
    "";

  const toRow = (rc: number): MonthlySalesRow | null => {
    const rows = cells.filter((c) => c.rowCode === rc);
    if (rows.length === 0) return null;
    return {
      rowCode: rc,
      label: label(rc),
      qtyPeriod: val(rc, 14),
      valuePeriod: val(rc, 17),
      qtyYtd: val(rc, 18),
      valueYtd: val(rc, 21),
      qtyPriorYtd: val(rc, 22),
      valuePriorYtd: val(rc, 25),
      rowTypeName: rows[0]?.rowTypeName ?? "",
    };
  };

  const products: MonthlySalesRow[] = [];
  const seqSet = new Set<number>();
  for (const c of cells) {
    if (c.rowCode === 4 && c.rowSequence !== undefined)
      seqSet.add(c.rowSequence);
  }
  for (const seq of seqSet) {
    const rowCells = cells.filter(
      (c) => c.rowCode === 4 && c.rowSequence === seq,
    );
    if (rowCells.length === 0) continue;
    const g = (col: number): number | null => {
      const cell = rowCells.find((c) => c.columnCode === col);
      if (!cell || !cell.value) return null;
      const s = cell.value.trim();
      return /^-?\d+$/.test(s) ? parseInt(s, 10) : null;
    };
    const lab =
      rowCells.find((c) => c.columnCode === 26)?.value?.trim() ??
      rowCells.find((c) => c.columnCode === 1)?.value?.trim() ??
      "";
    products.push({
      rowCode: 4,
      label: lab,
      qtyPeriod: g(14),
      valuePeriod: g(17),
      qtyYtd: g(18),
      valueYtd: g(21),
      qtyPriorYtd: g(22),
      valuePriorYtd: g(25),
      rowTypeName: rowCells[0]?.rowTypeName ?? "",
    });
  }

  const totals: MonthlySalesRow[] = [];
  for (const rc of [5, 8, 11, 14, 15, 16]) {
    const r = toRow(rc);
    if (r) totals.push(r);
  }

  const monthlySalesTotal = extractMonthlySalesAmount(html);
  const totalRow = totals.find((t) => t.rowCode === 16);
  const domRow = totals.find((t) => t.rowCode === 5);
  const expRow = totals.find((t) => t.rowCode === 8);

  const jalali = extractJalaliPeriodEnd(title);
  const periodEnd = jalali
    ? `${jalali.jy}/${String(jalali.jm).padStart(2, "0")}/${String(jalali.jd).padStart(2, "0")}`
    : null;

  return {
    periodEnd,
    goods: products,
    totals,
    monthlySalesTotal,
    ytdSalesTotal: totalRow?.valueYtd ?? null,
    priorYtdSalesTotal: totalRow?.valuePriorYtd ?? null,
    domesticMonthly: domRow?.valuePeriod ?? null,
    exportMonthly: expRow?.valuePeriod ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Quarterly income statement parsing (rayanDynamicStatement HTML)
// ═══════════════════════════════════════════════════════════════

export function extractIncomeStatement(
  html: string,
): QuarterlyFinancials | null {
  const tableMatch = html.match(
    /<table[^>]*class="[^"]*rayanDynamicStatement[^"]*"[^>]*>([\s\S]*?)<\/table>/,
  );
  if (!tableMatch) return null;
  const tableHtml = tableMatch[0];

  // ── Parse header: period-end dates ──
  const periodEnds: string[] = [];
  const headerRe =
    /<th[^>]*>\s*<span[^>]*>([^<]*(?:دوره|تجديد|تجدید)[^<]*)<\/span>/g;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(tableHtml)) !== null) {
    const txt = toAsciiDigits(hm[1]!.trim());
    const dm = txt.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (dm) periodEnds.push(`${dm[1]}/${dm[2]}/${dm[3]}`);
  }

  const parseNumberCell = (raw: string): number | null => {
    let s = toAsciiDigits(raw).trim();
    if (!s || s === "-" || s === "—" || s === "--") return null;
    const negative = /^\(/.test(s);
    s = s.replace(/[()\s,،٫]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
    const n = parseFloat(s);
    return negative ? -n : n;
  };

  const extractRowValues = (
    rowHtml: string,
    expectedCount: number,
  ): Array<number | null> => {
    const allValues: Array<number | null> = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowHtml)) !== null) {
      const text = cm[1]!.replace(/<[^>]+>/g, "").trim();
      allValues.push(parseNumberCell(text));
    }
    return allValues.slice(1, 1 + expectedCount);
  };

  const periodCount = periodEnds.length || 3;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm: RegExpExecArray | null;
  let revenues: Array<number | null> = [];
  let netProfits: Array<number | null> = [];
  let eps: Array<number | null> = [];
  let capitals: Array<number | null> = [];

  while ((rm = rowRe.exec(tableHtml)) !== null) {
    const rowHtml = rm[1]!;
    const labelMatch = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (!labelMatch) continue;
    const label = labelMatch[1]!
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const values = extractRowValues(rowHtml, periodCount);
    if (values.every((v) => v === null)) continue;

    // Skip cost/expense rows FIRST (they contain "درآمدهای عملیاتی" too)
    if (
      label.includes("بهاى تمام شده") ||
      label.includes("بهای تمام شده") ||
      label.includes("بهاي تمام شده") ||
      label.includes("هزينه") ||
      label.includes("هزینه")
    ) {
      continue;
    }

    if (
      (label.includes("درآمدهاي عملياتي") ||
        label.includes("درآمدهای عملیاتی")) &&
      revenues.length === 0
    ) {
      revenues = values;
    } else if (
      (label.includes("سود(زيان) خالص") || label.includes("سود خالص")) &&
      !label.includes("هر سهم") &&
      !label.includes("عمليات در حال تداوم") &&
      !label.includes("عمليات متوقف") &&
      netProfits.length === 0
    ) {
      netProfits = values;
    } else if (
      (label.includes("سود (زيان) خالص هر سهم") ||
        label.includes("سود خالص هر سهم")) &&
      eps.length === 0
    ) {
      eps = values;
    } else if (
      (label === "سرمايه" || label === "سرمایه") &&
      capitals.length === 0
    ) {
      capitals = values;
    }
  }

  if (revenues.length === 0 && netProfits.length === 0) return null;

  // ── Compute margins ──
  const len = Math.max(revenues.length, netProfits.length, periodEnds.length);
  const margins: Array<number | null> = [];
  for (let i = 0; i < len; i++) {
    const r = revenues[i];
    const p = netProfits[i];
    if (r && r > 0 && p !== null && p !== undefined) {
      margins.push(p / r);
    } else {
      margins.push(null);
    }
  }

  // ── Pick latest period: prefer positive interim margin ──
  // ── Pick latest period: prefer positive interim margin ──
  let latestMargin: number | null = null;
  let latestPeriod: string | null = null;

  // Step 1: first INTERIM period (not 12/29, not 12/30) with POSITIVE margin
  for (let i = 0; i < margins.length; i++) {
    const period = periodEnds[i];
    const m = margins[i];
    if (!period || m === null || m === undefined) continue;
    if (period.endsWith("/12/29") || period.endsWith("/12/30")) continue;
    if (m > 0) {
      latestMargin = m;
      latestPeriod = period;
      break;
    }
  }

  // Step 2: no positive interim → first POSITIVE period (even full-year)
  if (latestMargin === null) {
    for (let i = 0; i < margins.length; i++) {
      const period = periodEnds[i];
      const m = margins[i];
      if (!period || m === null || m === undefined) continue;
      if (m > 0) {
        latestMargin = m;
        latestPeriod = period;
        break;
      }
    }
  }

  // Step 3: no positive period at all → first interim (even negative)
  if (latestMargin === null) {
    for (let i = 0; i < margins.length; i++) {
      const period = periodEnds[i];
      const m = margins[i];
      if (!period || m === null || m === undefined) continue;
      if (period.endsWith("/12/29") || period.endsWith("/12/30")) continue;
      latestMargin = m;
      latestPeriod = period;
      break;
    }
  }

  // Step 4: nothing → first period (even negative, even full-year)
  if (latestMargin === null) {
    const m = margins[0];
    if (m !== null && m !== undefined) {
      latestMargin = m;
      latestPeriod = periodEnds[0] ?? null;
    }
  }

  const latestCapital = capitals.find((c) => c !== null && c > 0) ?? null;
  const sharesOutstanding = latestCapital ? latestCapital * 1000 : null;

  return {
    periodEnds,
    revenues,
    netProfits,
    eps,
    capitals,
    margins,
    latestMargin,
    latestPeriod,
    sharesOutstanding,
  };
}

// ═══════════════════════════════════════════════════════════════
// Fetch helpers
// ═══════════════════════════════════════════════════════════════

/** Simple fetch for monthly reports (datasource HTML). */
export async function fetchReportHtml(relativeUrl: string): Promise<string> {
  const url = relativeUrl.startsWith("/")
    ? `${CODAL_BASE}${relativeUrl}`
    : `${CODAL_BASE}/${relativeUrl}`;
  const res = await fetch(url, {
    headers: {
      ...H,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Codal report fetch ${res.status}: ${url}`);
  return res.text();
}

/**
 * Fetch income-statement HTML with a real browser.
 * Codal's income statement is rendered via ASP.NET postback after selecting
 * "صورت سود و زیان" from `#ctl00_ddlTable`.
 */
async function fetchIncomeStatementHtml(relativeUrl: string): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    locale: "fa-IR",
  });
  const page = await context.newPage();

  const url = relativeUrl.startsWith("/")
    ? `${CODAL_BASE}${relativeUrl}`
    : `${CODAL_BASE}/${relativeUrl}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for network to settle (Angular/ASP.NET)
    try {
      await page.waitForLoadState("networkidle", { timeout: 20000 });
    } catch {
      /* ignore — some pages keep polling */
    }

    // ── Check for dropdown ──
    const hasDropdown = await page
      .locator("#ctl00_ddlTable")
      .count()
      .then((c) => c > 0);

    if (!hasDropdown) {
      // Some reports have no dropdown — return whatever we got
      await page.waitForTimeout(2000);
      return await page.content();
    }

    // ── Select "صورت سود و زیان" (value = "1") ──
    await page.selectOption("#ctl00_ddlTable", "1");
    await page.waitForTimeout(2500);

    try {
      await page.waitForSelector('table[class*="rayanDynamicStatement"]', {
        timeout: 15000,
      });
    } catch {
      /* fall through — some reports have no income statement */
    }

    await page.waitForTimeout(1000);
    return await page.content();
  } finally {
    await page.close();
    await context.close();
  }
}

// ═══════════════════════════════════════════════════════════════
// Public fetchers
// ═══════════════════════════════════════════════════════════════

export async function fetchMonthlySales(
  symbol: string,
  count = 3,
): Promise<MonthlyReportResult[]> {
  const letters = await searchLetters(symbol);
  const monthly = filterMonthlySalesLetters(letters);
  const results: MonthlyReportResult[] = [];

  for (const letter of monthly.slice(0, count)) {
    const period = extractJalaliPeriodEnd(letter.title);
    if (!period) continue;
    try {
      const html = await fetchReportHtml(letter.url);
      const amount = extractMonthlySalesAmount(html);
      const detail = extractMonthlyReport(html, letter.title);
      if (amount && amount > 0) {
        results.push({
          periodEnd: period,
          amount,
          reportUrl: `${CODAL_BASE}${letter.url}`,
          detail,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `  [${symbol}] Codal report parse failed: ${msg.slice(0, 100)}`,
      );
    }
  }
  return results;
}

export async function fetchQuarterlyFinancials(
  symbol: string,
): Promise<QuarterlyResult | null> {
  const letters = await searchLetters(symbol, { LetterType: "6" });
  const filtered = letters.filter(
    (l) =>
      (l.title.includes("صورت") || l.title.includes("مالی")) &&
      !l.title.includes("اصلاحیه") &&
      !l.title.includes("تفسیری"),
  );

  for (const letter of filtered.slice(0, 3)) {
    try {
      const html = await fetchIncomeStatementHtml(letter.url);
      const fin = extractIncomeStatement(html);
      if (fin && fin.latestMargin !== null) {
        return {
          latestPeriod: fin.latestPeriod,
          latestMargin: fin.latestMargin,
          financials: fin,
          reportUrl: `${CODAL_BASE}${letter.url}`,
        };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `  [${symbol}] quarterly parse failed: ${msg.slice(0, 100)}`,
      );
    }
  }
  return null;
}

export { CODAL_SEARCH as API_BASE, CODAL_BASE };

/**
 * Ingestion service — pulls real TSE data from TSETMC + Codal.ir
 * and persists it to PostgreSQL.
 *
 * Pipeline:
 *   Phase 1: TSETMC symbols + prices
 *   Phase 2: Codal monthly sales → monthly_sales
 *   Phase 3: Codal quarterly financials → quarterly_financials
 *   Phase 4: Forward P/E → forward_pe
 *   Phase 5: Refresh materialized view
 *
 * Fixed issues:
 *   - sp.last_price → sp2.last_price (SQL 42703)
 *   - is_bank/is_insurance/is_holding_company set from WATCHLIST
 *   - syncMonthlySales: retry + backoff + controlled concurrency
 *   - syncQuarterlyFinancials: filter margin <= 0
 *   - forward_pe pruning: uses ctid (no id column)
 *   - recomputeForwardPe: margin from quarterly_financials (real data)
 *   - Playwright browser closed in finally
 *
 * FX + USD support (Phase B–D):
 *   - fx.ts scraper (Wallex + Nobitex) with quality tagging
 *   - syncMonthlySales: USD conversion via nearest-date FX rate lookup
 *   - syncFxRates / getFxRateForDate (nearest-date with forward-fallback)
 *   - syncMarketCapHistory: prices.last_price × shares × FX → USD mcap series
 *
 * Forward P/E basis (current):
 *   - Revenue side = last 3 months of sales (≈ one quarter), annualised × 4
 *   - Margin side  = most recent reported quarterly net margin
 *   - Partial quarter → AVG(month) × 3, then × 4
 *   - Method tags: last3m_annualised | last3m_avg_annualised | *_assumed_margin
 */

import postgres from "postgres";
import { tsetmc, type ResolvedInstrument } from "#scrapers/tsetmc";
import {
  fetchFxRate,
  type FxRate,
  type FxSource,
  type FxQualityStatus,
} from "#scrapers/fx";
import {
  fetchMonthlySales,
  fetchQuarterlyFinancials,
  closeBrowser,
  searchLetters,
  filterMonthlySalesLetters,
  fetchReportHtml,
  extractMonthlySalesFull,
  type CodalLetter,
  type MonthlyReportResult,
} from "#scrapers/codal";
import { jalaliToGregorian, toIsoDate } from "#utils/jalali";

type PostgresDb = ReturnType<typeof postgres>;

/** Watchlist of TSE symbols to scrape. */
export type WatchlistType = "general" | "bank" | "insurance" | "holding";

export const WATCHLIST: Array<{
  sym: string;
  name: string;
  type: WatchlistType;
}> = [
  // ── فلزات اساسی (Basic Metals) ──────────────────────
  // { sym: "فولاد", name: "فولاد مبارکه", type: "general" },
  // { sym: "فخوز", name: "فولاد خوزستان", type: "general" },
  // { sym: "فخاس", name: "فولاد خراسان", type: "general" },
  // { sym: "ذوب", name: "ذوب‌آهن اصفهان", type: "general" },
  // { sym: "فملی", name: "ملی صنایع مس ایران", type: "general" },
  // { sym: "فایرا", name: "آلومینیوم ایران", type: "general" },
  // { sym: "فمراد", name: "آلومراد", type: "general" },
  // { sym: "فپارس", name: "آلومینیوم پارس", type: "general" },
  // { sym: "فالوم", name: "آلومتک", type: "general" },
  // { sym: "فزرین", name: "معدن زرین آسیا", type: "general" },
  // { sym: "فجر", name: "فولاد امیرکبیر کاشان", type: "general" },
  // { sym: "فاراک", name: "ماشین‌سازی اراک", type: "general" },
  // { sym: "فوکا", name: "فولاد کاویان", type: "general" },
  // { sym: "فسرب", name: "ملی سرب و روی", type: "general" },
  // { sym: "فسبزوار", name: "پارس فولاد سبزوار", type: "general" },
  // { sym: "فاسمین", name: "کالسیمین", type: "general" },
  // { sym: "کروی", name: "توسعه معادن روی ایران", type: "general" },
  // { sym: "کگل", name: "گل‌گهر", type: "general" },
  // { sym: "کچاد", name: "چادرملو", type: "general" },

  // ── پالایش و پتروشیمی (Refining & Petrochemical) ────
  // { sym: "شپنا", name: "پالایش نفت اصفهان", type: "general" },
  // { sym: "شبندر", name: "پالایش نفت بندرعباس", type: "general" },
  // { sym: "شتران", name: "پالایش نفت تهران", type: "general" },
  // { sym: "شبریز", name: "پالایش نفت تبریز", type: "general" },
  // { sym: "شپدیس", name: "پتروشیمی پردیس", type: "general" },
  // { sym: "شیراز", name: "پتروشیمی شیراز", type: "general" },
  // { sym: "شاراک", name: "پتروشیمی شازند", type: "general" },
  // { sym: "شپارس", name: "بین‌المللی محصولات پارس", type: "general" },
  // { sym: "شپاکسا", name: "پاکسان", type: "general" },
  // { sym: "شخارک", name: "پتروشیمی خارک", type: "general" },
  // { sym: "تاپیکو", name: "سرمایه‌گذاری نفت و گاز تامین", type: "general" },

  // // ── خودرو (Automotive) ──────────────────────────────
  // { sym: "خودرو", name: "ایران خودرو", type: "general" },
  // { sym: "خساپا", name: "سایپا", type: "general" },
  // { sym: "خپارس", name: "پارس خودرو", type: "general" },
  // { sym: "پتایر", name: "ایران تایر", type: "general" },
  // { sym: "پاسا", name: "ایران یاسا تایر", type: "general" },

  // // ── دارویی (Pharmaceuticals) ────────────────────────
  { sym: "برکت", name: "گروه دارویی برکت", type: "general" },
  { sym: "دتولید", name: "داروسازی تولید دارو", type: "general" },
  { sym: "دسبحا", name: "گروه دارویی سبحان", type: "general" },
  { sym: "دلقما", name: "دارویی لقمان", type: "general" },
  { sym: "دعبید", name: "لابراتوار داروسازی دکتر عبیدی", type: "general" },
  { sym: "دپارس", name: "پارس دارو", type: "general" },
  { sym: "دیران", name: "ایران دارو", type: "general" },
  { sym: "دالبر", name: "البرز دارو", type: "general" },

  // // ── غذایی (Food) ────────────────────────────────────
  { sym: "غپونه", name: "نوش پونه مشهد", type: "general" },
  { sym: "غشهد", name: "شهد ایران", type: "general" },
  { sym: "غچین", name: "کشت و صنعت چین چین", type: "general" },
  { sym: "غگرجی", name: "بیسکویت گرجی", type: "general" },
  { sym: "غبهنوش", name: "بهنوش ایران", type: "general" },

  // // ── سیمان (Cement) ──────────────────────────────────
  { sym: "ستران", name: "سیمان تهران", type: "general" },
  { sym: "سفارس", name: "سیمان فارس و خوزستان", type: "general" },
  { sym: "سبزوا", name: "سیمان لار سبزوار", type: "general" },

  // // ── صنعتی و سایر (Industrial & Others) ──────────────
  { sym: "کپشیر", name: "پشم شیشه ایران", type: "general" },
  { sym: "تپمپی", name: "پمپ‌سازی ایران", type: "general" },
  { sym: "پلاسک", name: "پلاسکوکار", type: "general" },
  { sym: "کسرام", name: "پارس سرام", type: "general" },
  { sym: "کچینی", name: "کارخانه چینی ایران", type: "general" },
  { sym: "لپارس", name: "پارس الکتریک", type: "general" },
  { sym: "حکشتی", name: "کشتیرانی", type: "general" },
  { sym: "تمحرکه", name: "ماشین‌سازی نیرومحرکه", type: "general" },

  // // ── بانک‌ها (Banks) ─────────────────────────────────
  { sym: "وبملت", name: "بانک ملت", type: "bank" },
  { sym: "وبصادر", name: "بانک صادرات", type: "bank" },
  { sym: "وپاسار", name: "بانک پاسارگاد", type: "bank" },
  { sym: "وتجارت", name: "بانک تجارت", type: "bank" },
  { sym: "وبفارس", name: "بانک پارسیان", type: "bank" },
  { sym: "وکار", name: "بانک کارآفرین", type: "bank" },
  { sym: "وپارس", name: "بانک پارسیان", type: "bank" },
  { sym: "ونوین", name: "بانک اقتصاد نوین", type: "bank" },
  { sym: "وخاور", name: "بانک خاورمیانه", type: "bank" },
  { sym: "وسینا", name: "بانک سینا", type: "bank" },
  { sym: "وپست", name: "پست بانک", type: "bank" },

  // // ── بیمه (Insurance) ────────────────────────────────
  { sym: "وبیمه", name: "بیمه ایران", type: "insurance" },
  { sym: "وپارسیان", name: "بیمه پارسیان", type: "insurance" },
  { sym: "ودی", name: "بیمه دی", type: "insurance" },
  { sym: "ونیکی", name: "بیمه نیکان", type: "insurance" },
  { sym: "آسیا", name: "بیمه آسیا", type: "insurance" },
  { sym: "البرز", name: "بیمه البرز", type: "insurance" },
  { sym: "دانا", name: "بیمه دانا", type: "insurance" },

  // // ── هلدینگ‌ها (Holdings) ────────────────────────────
  { sym: "پارسان", name: "گسترش نفت و گاز پارسیان", type: "holding" },
  { sym: "شستا", name: "سرمایه‌گذاری تأمین اجتماعی", type: "holding" },
  { sym: "خگستر", name: "گسترش سرمایه‌گذاری ایران‌خودرو", type: "holding" },
  { sym: "وغدیر", name: "سرمایه‌گذاری غدیر", type: "holding" },
  { sym: "وامید", name: "سرمایه‌گذاری امید", type: "holding" },
  { sym: "وصندوق", name: "سرمایه‌گذاری صندوق بازنشستگی", type: "holding" },
];

/** Fast lookup: symbol → watchlist entry. */
const WATCHLIST_BY_SYM = new Map(WATCHLIST.map((w) => [w.sym, w]));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tunables */
const DELAY_MS = 900;
const FETCH_TIMEOUT_MS = 25_000;
const RETRY_ATTEMPTS = 3;
const CODAL_CONCURRENCY = 3;
const MONTHLY_SALES_DEPTH = 36;

/** Retry with exponential backoff. */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = RETRY_ATTEMPTS,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(baseDelayMs * (i + 1));
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════
// Concurrency helper (must be defined BEFORE sync functions)
// ═══════════════════════════════════════════════════════════════

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await fn(item, i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Phase 1: TSETMC symbols + prices
// ═══════════════════════════════════════════════════════════════

export async function scrapeAllSymbols(): Promise<ResolvedInstrument[]> {
  const out: ResolvedInstrument[] = [];
  for (const item of WATCHLIST) {
    try {
      const snap = await tsetmc.resolveSymbol(item.sym, item.name);
      if (snap) {
        out.push(snap);
        console.log(`  [${item.sym}] ✓ ${snap.sector} price=${snap.lastPrice}`);
      } else {
        console.log(`  [${item.sym}] ✗ not found`);
      }
    } catch (e: unknown) {
      console.error(
        `  [${item.sym}] ✗ ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await sleep(DELAY_MS);
  }
  return out;
}

export async function upsertStocks(
  sql: PostgresDb,
  stocks: ResolvedInstrument[],
): Promise<number> {
  let count = 0;
  for (const s of stocks) {
    const wl = WATCHLIST_BY_SYM.get(s.symbol);
    const isBank = wl?.type === "bank";
    const isInsurance = wl?.type === "insurance";
    const isHolding = wl?.type === "holding";

    await sql`
      INSERT INTO stocks (symbol, name, sector, isin, shares_outstanding,
                          is_bank, is_insurance, is_holding_company, updated_at)
      VALUES (${s.symbol}, ${s.name}, ${s.sector}, ${s.isin}, ${s.shares},
              ${isBank}, ${isInsurance}, ${isHolding}, NOW())
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name,
        sector = EXCLUDED.sector,
        isin = EXCLUDED.isin,
        shares_outstanding = EXCLUDED.shares_outstanding,
        is_bank = EXCLUDED.is_bank,
        is_insurance = EXCLUDED.is_insurance,
        is_holding_company = EXCLUDED.is_holding_company,
        updated_at = NOW()
    `;
    count++;
  }
  return count;
}

export async function insertPrices(
  sql: PostgresDb,
  stocks: ResolvedInstrument[],
): Promise<number> {
  let count = 0;
  for (const s of stocks) {
    await sql`
      INSERT INTO prices (symbol, timestamp, last_price, volume, value, change_percent)
      VALUES (${s.symbol}, NOW(), ${s.lastPrice}, ${s.volume}, ${s.value}, ${s.changePct})
    `;
    count++;
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════
// Phase 2: Codal monthly sales
// ═══════════════════════════════════════════════════════════════

interface MonthlySalesDetail {
  domesticMonthly?: number | string | null;
  exportMonthly?: number | string | null;
  serviceMonthly?: number | string | null;
  ytdSalesTotal?: number | string | null;
  priorYtdSalesTotal?: number | string | null;
}

export async function syncMonthlySales(
  sql: PostgresDb,
  symbols: string[],
): Promise<number> {
  let count = 0;

  // Skip bank/insurance/holding (no monthly sales reports)
  const eligible = symbols.filter((sym) => {
    const wl = WATCHLIST_BY_SYM.get(sym);
    if (!wl) return true;
    return wl.type === "general";
  });

  const skipped = symbols.length - eligible.length;
  if (skipped > 0) {
    console.log(
      `  ↷ skipped ${skipped} financial instruments (bank/insurance/holding)`,
    );
  }

  await mapWithConcurrency(eligible, CODAL_CONCURRENCY, async (symbol) => {
    try {
      const sales: MonthlyReportResult[] = await withRetry(() =>
        Promise.race([
          fetchMonthlySales(symbol, MONTHLY_SALES_DEPTH),
          new Promise<never>((_, rej) =>
            setTimeout(
              () => rej(new Error("timeout")),
              (FETCH_TIMEOUT_MS * MONTHLY_SALES_DEPTH) / 3,
            ),
          ),
        ]),
      );

      // Shared FX rate for this symbol's batch (rates are daily)
      const fxRate = await getFxRateForDate(sql, null).catch(() => null);
      const rateRial = fxRate?.rateRial ?? null;

      const toUsd = (rialMillions: number | null) =>
        rialMillions != null && rateRial && rateRial > 0
          ? (rialMillions * 1_000_000) / rateRial
          : null;

      for (const s of sales) {
        const monthEnd = toIsoDate(
          jalaliToGregorian(s.periodEnd.jy, s.periodEnd.jm, s.periodEnd.jd),
        );

        const d: any = s.detail ?? {};
        const domRial =
          d.domesticMonthly != null ? Number(d.domesticMonthly) : null;
        const expRial =
          d.exportMonthly != null ? Number(d.exportMonthly) : null;
        const svcRial =
          d.serviceMonthly != null ? Number(d.serviceMonthly) : null;
        // YTD values from full report (detail has ytdSalesTotal, priorYtdSalesTotal)
        const ytdRial =
          s.full?.ytdTotal != null ? Number(s.full.ytdTotal) : null;
        const ytdPriorRial =
          s.full?.ytdPriorYearTotal != null
            ? Number(s.full.ytdPriorYearTotal)
            : null;

        await sql`
          INSERT INTO monthly_sales (symbol, month_end, sales_amount, is_estimated, source_url, fetched_at, detail,
                                     sales_usd, domestic_usd, export_usd, service_usd,
                                     ytd_total_usd, ytd_prior_year_usd,
                                     fx_rate_rial, fx_quality, fx_sources)
          VALUES (
            ${symbol}, ${monthEnd}, ${s.amount}, false, ${s.reportUrl}, NOW(),
            ${JSON.stringify(s.detail ?? null)}::jsonb,
            ${toUsd(s.amount)}, ${toUsd(domRial)}, ${toUsd(expRial)}, ${toUsd(svcRial)},
            ${toUsd(ytdRial)}, ${toUsd(ytdPriorRial)},
            ${rateRial},
            ${fxRate ? fxRate.quality : null},
            ${fxRate ? Array.from(fxRate.sources) : null}
          )
          ON CONFLICT (symbol, month_end) DO UPDATE SET
            sales_amount = EXCLUDED.sales_amount,
            source_url  = EXCLUDED.source_url,
            fetched_at  = NOW(),
            detail      = EXCLUDED.detail,
            sales_usd     = EXCLUDED.sales_usd,
            domestic_usd  = EXCLUDED.domestic_usd,
            export_usd    = EXCLUDED.export_usd,
            service_usd   = EXCLUDED.service_usd,
            ytd_total_usd       = EXCLUDED.ytd_total_usd,
            ytd_prior_year_usd  = EXCLUDED.ytd_prior_year_usd,
            fx_rate_rial  = EXCLUDED.fx_rate_rial,
            fx_quality    = EXCLUDED.fx_quality,
            fx_sources    = EXCLUDED.fx_sources
        `;
        count++;
      }
      console.log(`  [${symbol}] ✓ ${sales.length} monthly sales records`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [${symbol}] ✗ ${msg.slice(0, 160)}`);
    }
    await sleep(DELAY_MS);
  });

  return count;
}

// ═══════════════════════════════════════════════════════════════
// Phase 3: Codal quarterly financials (Playwright)
// ═══════════════════════════════════════════════════════════════

/**
 * Convert Codal's CUMULATIVE year-to-date income-statement columns into
 * discrete single-quarter figures.
 *
 * Codal publishes one income statement per letter, whose columns are cumulative:
 *   3 ماهه → Q1 YTD
 *   6 ماهه → H1 YTD  (= Q1 + Q2)
 *   9 ماهه → 9M YTD  (= Q1 + Q2 + Q3)
 *   12 ماهه → FY YTD (= Q1..Q4)
 *
 * A single letter therefore yields multiple overlapping cumulative snapshots.
 * Storing those directly would double-count (a 6M column would be written as
 * "Q1" purely because its period-end lands in month 3) and make the TTM margin
 * wildly wrong.
 *
 * This function groups every (periodEnd, duration, revenue, profit) tuple by
 * fiscal year, sorts by duration, and differences consecutive cumulative values
 * to recover true single-quarter revenue/profit. A missing shorter cumulative
 * column means that quarter cannot be isolated and is dropped.
 */
export interface DiscreteQuarter {
  fiscalYear: number;
  quarter: number;
  periodEnd: string; // ISO Gregorian
  revenue: number | null;
  netProfit: number | null;
  margin: number | null; // single-quarter net margin
}

export function toDiscreteQuarters(f: {
  periodEnds: string[];
  durationMonths?: number[];
  revenues: Array<number | null>;
  netProfits: Array<number | null>;
}): DiscreteQuarter[] {
  interface Cum {
    fiscalYear: number;
    quarter: number;
    periodEnd: string;
    duration: number;
    revenue: number | null;
    netProfit: number | null;
  }

  // ── 1. Normalise every column into a cumulative record ──
  const cums: Cum[] = [];
  for (let i = 0; i < f.periodEnds.length; i++) {
    const pe = f.periodEnds[i];
    if (!pe) continue;

    const jy = parseInt(pe.slice(0, 4), 10);
    const jm = parseInt(pe.slice(5, 7), 10);
    const jd = parseInt(pe.slice(8, 10), 10);
    if (!jy || !jm || !jd) continue;

    // Duration: prefer the parsed "N ماهه" label, else derive from period-end month.
    const labelled = f.durationMonths?.[i] ?? 0;
    const duration =
      labelled > 0 ? labelled : Math.min(4, Math.ceil(jm / 3)) * 3;

    cums.push({
      fiscalYear: jy,
      quarter: Math.min(4, Math.max(1, Math.round(duration / 3))),
      periodEnd: toIsoDate(jalaliToGregorian(jy, jm, jd)),
      duration,
      revenue: f.revenues[i] ?? null,
      netProfit: f.netProfits[i] ?? null,
    });
  }

  // ── 2. Group by fiscal year, keep the longest cumulative per quarter ──
  const byYear = new Map<number, Cum[]>();
  for (const c of cums) {
    const arr = byYear.get(c.fiscalYear) ?? [];
    arr.push(c);
    byYear.set(c.fiscalYear, arr);
  }

  // ── 3. Difference consecutive cumulative values → single quarters ──
  const out: DiscreteQuarter[] = [];
  for (const [, arr] of byYear) {
    arr.sort((a, b) => a.duration - b.duration);

    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i]!;
      const prev = i > 0 ? arr[i - 1]! : null;

      // Q1: the 3-month cumulative IS the single quarter.
      // Q2..Q4: single quarter = this cumulative − previous cumulative.
      let revenue: number | null;
      let netProfit: number | null;

      if (cur.duration <= 3) {
        // Q1: the 3-month cumulative IS the single quarter.
        revenue = cur.revenue;
        netProfit = cur.netProfit;
      } else if (!prev) {
        // No shorter cumulative in this fiscal year — cannot isolate this
        // quarter without guessing (e.g. a lone 6M column could be Q1+Q2).
        continue;
      } else {
        // Without a prior cumulative we cannot isolate this quarter.
        if (prev.revenue === null || cur.revenue === null) {
          revenue = null;
          netProfit = null;
        } else {
          revenue = cur.revenue - prev.revenue;
        }
        if (prev.netProfit === null || cur.netProfit === null) {
          netProfit = null;
        } else {
          netProfit = cur.netProfit - prev.netProfit;
        }
      }

      const margin =
        revenue !== null && netProfit !== null && revenue > 0
          ? netProfit / revenue
          : null;

      out.push({
        fiscalYear: cur.fiscalYear,
        quarter: cur.quarter,
        periodEnd: cur.periodEnd,
        revenue,
        netProfit,
        margin,
      });
    }
  }

  return out;
}

export async function syncQuarterlyFinancials(
  sql: PostgresDb,
  symbols: string[],
): Promise<number> {
  let count = 0;

  await mapWithConcurrency(symbols, 2, async (symbol) => {
    try {
      const q = await withRetry(() => fetchQuarterlyFinancials(symbol));
      if (!q) return;

      const f = q.financials;

      // Convert Codal's cumulative YTD columns into discrete single quarters.
      const quarters = toDiscreteQuarters({
        periodEnds: f.periodEnds ?? [],
        durationMonths: f.durationMonths ?? [],
        revenues: f.revenues ?? [],
        netProfits: f.netProfits ?? [],
      });

      if (quarters.length === 0) {
        console.log(`  [${symbol}] ✗ no quarterly periods parsed`);
        return;
      }

      for (const qtr of quarters) {
        // Skip quarters with no usable margin (P/E would be meaningless)
        if (qtr.margin === null) {
          console.log(
            `  [${symbol}] ✗ Q${qtr.quarter} ${qtr.fiscalYear} margin=null, skipping`,
          );
          continue;
        }

        await sql`
          INSERT INTO quarterly_financials (
            symbol, fiscal_year, quarter, period_end,
            revenue, net_profit, net_margin, shares_outstanding,
            source_url, fetched_at
          )
          VALUES (
            ${symbol}, ${qtr.fiscalYear}, ${qtr.quarter}, ${qtr.periodEnd},
            ${qtr.revenue}, ${qtr.netProfit}, ${qtr.margin}, ${f.sharesOutstanding},
            ${q.reportUrl}, NOW()
          )
          ON CONFLICT (symbol, fiscal_year, quarter) DO UPDATE SET
            period_end = EXCLUDED.period_end,
            revenue = EXCLUDED.revenue,
            net_profit = EXCLUDED.net_profit,
            net_margin = EXCLUDED.net_margin,
            shares_outstanding = EXCLUDED.shares_outstanding,
            source_url = EXCLUDED.source_url,
            fetched_at = NOW()
        `;

        const marginStr = (qtr.margin * 100).toFixed(1) + "%";
        const revStr =
          qtr.revenue != null ? (qtr.revenue / 1e9).toFixed(1) + "B" : "—";
        console.log(
          `  [${symbol}] ✓ Q${qtr.quarter} ${qtr.fiscalYear} rev=${revStr} margin=${marginStr}`,
        );
        count++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  [${symbol}] ✗ ${msg.slice(0, 100)}`);
    }
  });

  return count;
}

// ═══════════════════════════════════════════════════════════════
// Phase 4: Forward P/E
// ═══════════════════════════════════════════════════════════════

export async function recomputeForwardPe(sql: PostgresDb): Promise<number> {
  // Basis: last 3 calendar months of sales (≈ one quarter), annualised × 4,
  // combined with the most recent reported quarterly net margin.
  const rows = await sql`
    WITH sales AS (
      SELECT symbol, sales_amount, month_end,
             ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY month_end DESC) AS rn
      FROM monthly_sales
    ),
    last3 AS (
      SELECT
        symbol,
        SUM(sales_amount) AS sum_sales,
        AVG(sales_amount) AS avg_sales,
        COUNT(*)::int AS month_count
      FROM sales
      WHERE rn <= 3
      GROUP BY symbol
    ),
    -- Trailing 12-month baseline. Kept alongside the last-3-month basis so the
    -- spread between "recent run-rate" and "trailing year" stays visible: when
    -- the two diverge sharply, the cheaper P/E is an extrapolation, not a fact.
    last12 AS (
      SELECT
        symbol,
        SUM(sales_amount) AS sum_sales_12m,
        AVG(sales_amount) AS avg_sales_12m,
        COUNT(*)::int AS month_count_12m
      FROM sales
      WHERE rn <= 12
      GROUP BY symbol
    ),
    recent_price AS (
      SELECT DISTINCT ON (symbol) symbol, last_price
      FROM prices ORDER BY symbol, timestamp DESC
    ),
    -- Most recent reported quarterly margin (positive only, last 365 days)
    latest_quarterly AS (
      SELECT DISTINCT ON (symbol)
        symbol, net_margin, quarter
      FROM quarterly_financials
      WHERE period_end > NOW() - INTERVAL '365 days'
        AND net_margin IS NOT NULL AND net_margin > 0
      ORDER BY symbol, period_end DESC
    )
    SELECT
      sp.symbol,
      sp2.last_price,
      sp.shares_outstanding,
      sp.is_bank,
      sp.is_insurance,
      sp.is_holding_company,
      l3.sum_sales,
      l3.avg_sales,
      COALESCE(l3.month_count, 0) AS month_count,
      l12.sum_sales_12m,
      l12.avg_sales_12m,
      COALESCE(l12.month_count_12m, 0) AS month_count_12m,
      lq.net_margin AS quarterly_margin,
      lq.quarter AS quarterly_quarter,
      (lq.net_margin IS NOT NULL) AS margin_from_quarterly
    FROM stocks sp
     JOIN recent_price sp2 ON sp2.symbol = sp.symbol
     LEFT JOIN last3 l3 ON l3.symbol = sp.symbol
     LEFT JOIN last12 l12 ON l12.symbol = sp.symbol
     LEFT JOIN latest_quarterly lq ON lq.symbol = sp.symbol
  `;

  let count = 0;

  for (const r of rows) {
    const shares = Number(r.shares_outstanding ?? 0);
    const price = Number(r.last_price ?? 0);
    const sumSales = Number(r.sum_sales ?? 0);
    const avgSales = Number(r.avg_sales ?? 0);
    const monthCount = Number(r.month_count ?? 0);

    const sumSales12 = Number(r.sum_sales_12m ?? 0);
    const avgSales12 = Number(r.avg_sales_12m ?? 0);
    const monthCount12 = Number(r.month_count_12m ?? 0);
    const isBank = Boolean(r.is_bank);
    const isInsurance = Boolean(r.is_insurance);
    const isHolding = Boolean(r.is_holding_company);
    const isFinancial = isBank || isInsurance || isHolding;

    const quarterlyMargin =
      r.quarterly_margin != null ? Number(r.quarterly_margin) : null;
    const marginFromQuarterly = Boolean(r.margin_from_quarterly);

    // Last 3 months of sales → annualised. SUM when we have a full quarter,
    // otherwise AVG × 3 so a partial quarter does not understate run-rate.
    const hasFullQuarter = monthCount >= 3;
    const quarterlySales = hasFullQuarter ? sumSales : avgSales * 3;
    const yearlySales = quarterlySales * 4;

    // Trailing 12-month baseline, same margin. This is the conservative
    // counterpart: it never assumes the recent run-rate persists, so the gap
    // between the two is the size of the extrapolation being made.
    const hasFullYear = monthCount12 >= 12;
    const yearlySales12 = hasFullYear ? sumSales12 : avgSales12 * 12;

    // Sector fallback margins are only defensible for financials, whose
    // business model genuinely differs from industrials. For non-financial
    // issuers an unsourced default produces confidently-wrong P/E, so we
    // decline to publish rather than guess.
    const sectorDefault = isBank
      ? 0.15
      : isInsurance
        ? 0.08
        : isHolding
          ? 0.05
          : null;

    let margin: number;
    let marginSource: string;
    let marginIsAssumed = false;
    if (quarterlyMargin != null && quarterlyMargin > 0) {
      const qLabel =
        r.quarterly_quarter === 3
          ? "۹ ماهه"
          : r.quarterly_quarter === 4
            ? "۱۲ ماهه"
            : r.quarterly_quarter === 2
              ? "۶ ماهه"
              : "۳ ماهه";
      margin = quarterlyMargin;
      marginSource = `حاشیه سود آخرین فصل (${qLabel}) (${(margin * 100).toFixed(1)}٪)`;
    } else if (sectorDefault != null) {
      margin = sectorDefault;
      marginIsAssumed = true;
      marginSource = `حاشیه سود پیش‌فرض ${isBank ? "بانکی" : isInsurance ? "بیمه‌ای" : "هلدینگی"} (${(margin * 100).toFixed(1)}٪) ⚠️ برآورد`;
    } else {
      // No margin evidence at all → leave P/E unpublished rather than invent one.
      margin = 0;
      marginSource = "بدون حاشیه سود معتبر — P/E محاسبه نشد";
    }

    let eps: number | null = null;
    let pe: number | null = null;
    let pe12: number | null = null;
    let eps12: number | null = null;
    let confidence = "non_calculable";
    let confidenceScore = 0;
    let disclaimer = "";

    if (isFinancial && !marginFromQuarterly) {
      disclaimer =
        "برای بانک/بیمه/هلدینگ، محاسبه P/E Forward نیازمند صورت مالی فصلی است.";
    } else if (
      price > 0 &&
      shares > 0 &&
      quarterlySales > 0 &&
      margin > 0 &&
      !marginIsAssumed
    ) {
      const annualSales = yearlySales * 1_000_000;
      eps = (annualSales * margin) / shares;

      if (eps > 0) {
        pe = price / eps;

        if (monthCount >= 3) {
          confidenceScore = 0.75;
          confidence = "high";
        } else if (monthCount === 2) {
          confidenceScore = 0.5;
          confidence = "medium";
        } else {
          confidenceScore = 0.3;
          confidence = "low";
        }

        if (marginFromQuarterly) {
          confidenceScore = Math.min(1.0, confidenceScore + 0.25);
          if (confidenceScore >= 0.75) confidence = "high";
          else if (confidenceScore >= 0.4) confidence = "medium";
          else confidence = "low";
        }

        const salesNote = hasFullQuarter
          ? `فروش ${monthCount} ماه اخیر (${Math.round(quarterlySales).toLocaleString()} میلیون ریال × ۴)`
          : `فروش ${monthCount} ماه اخیر (میانگین × ۳ × ۴)`;

        // Baseline P/E on the trailing 12 months. If the two bases disagree
        // sharply the "cheap" P/E is mostly extrapolation, so say so and
        // reduce confidence rather than presenting it as a solid number.
        if (shares > 0 && yearlySales12 > 0) {
          eps12 = (yearlySales12 * 1_000_000 * margin) / shares;
          if (eps12 > 0) pe12 = price / eps12;
        }

        const divergence =
          pe12 != null && pe12 > 0 && pe > 0
            ? Math.abs(pe - pe12) / pe12
            : null;

        let basisNote = "";
        if (divergence != null) {
          const cheaper = Math.min(pe, pe12!);
          const pricier = Math.max(pe, pe12!);
          basisNote =
            ` مبنای ۱۲ ماه اخیر: P/E ≈ ${pe12!.toFixed(2)}. ` +
            `فاصله دو مبنا ${(divergence * 100).toFixed(0)}٪ است` +
            (pe < pe12!
              ? ` — ارزان‌ترین عدد (${cheaper.toFixed(2)}) حاصل فرض تداوم فروش اخیر است.`
              : ` — عدد بالاتر (${pricier.toFixed(2)}) بر مبنای ۱۲ ماه اخیر است.`);
        }

        // A wide gap between the two bases is genuine uncertainty.
        if (divergence != null && divergence > 0.25) {
          confidenceScore = Math.max(0.2, confidenceScore - 0.25);
          confidence =
            confidenceScore >= 0.75
              ? "high"
              : confidenceScore >= 0.4
                ? "medium"
                : "low";
          basisNote +=
            " ⚠️ عدم قطعیت بالا به دلیل اختلاف زیاد بین مبناهای محاسبه.";
        }

        disclaimer = `برآورد بر اساس ${salesNote} و ${marginSource}.${basisNote} ⚠️ این یک برآورد است، نه پیش‌بینی قیمت.`;
      }
    } else if (marginIsAssumed) {
      disclaimer = `حاشیه سود از میانگین صنعتی ${isBank ? "بانکی" : isInsurance ? "بیمه‌ای" : "هلدینگی"} برآورد شده (${(margin * 100).toFixed(1)}٪). برای دقت بیشتر به صورت مالی فصلی نیاز است.`;
    } else if (!marginFromQuarterly) {
      disclaimer =
        "صورت مالی فصلی در دسترس نیست، بنابراین حاشیه سود معتبری برای محاسبه P/E Forward وجود ندارد. برای شرکت‌های غیرمالی از حاشیه پیش‌فرض استفاده نمی‌شود چون نتیجه گمراه‌کننده خواهد بود.";
    } else {
      disclaimer =
        "داده‌های قیمت، سهام یا فروش ماهانه کافی موجود نیست. P/E Forward غیرقابل محاسبه.";
    }

    const method =
      pe == null
        ? "unavailable"
        : marginIsAssumed
          ? "last3m_annualised_assumed_margin"
          : hasFullQuarter
            ? "last3m_annualised"
            : "last3m_avg_annualised";

    await sql`
      INSERT INTO forward_pe (symbol, calculated_at, estimated_annual_eps, forward_pe,
                              confidence, confidence_score, method, margin_used, disclaimer,
                              calculation_json)
      VALUES (${r.symbol}, NOW(), ${eps}, ${pe}, ${confidence}, ${confidenceScore},
              ${method}, ${margin}, ${disclaimer},
              ${JSON.stringify({
                basis: "last_3_months_annualised_x4",
                baseline_basis: "last_12_months_sum",
                quarterlySales,
                yearlySales,
                hasFullQuarter,
                monthCount,
                yearlySales12,
                hasFullYear,
                monthCount12,
                pe12,
                eps12,
                quarterlyMargin,
                marginSource,
              })}::jsonb)
    `;

    await sql`
      DELETE FROM forward_pe
      WHERE ctid IN (
        SELECT ctid FROM (
          SELECT ctid, ROW_NUMBER() OVER (
            PARTITION BY symbol ORDER BY calculated_at DESC
          ) AS rn
          FROM forward_pe
          WHERE symbol = ${r.symbol}
        ) t
        WHERE t.rn > 30
      )
    `;

    count++;
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════
// Phase 5: Refresh rankings
// ═══════════════════════════════════════════════════════════════

export async function refreshRankings(sql: PostgresDb): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW stock_rankings`;
}

// ═══════════════════════════════════════════════════════════════
// Phase 0: FX rates (Wallex + Nobitex)
// ═══════════════════════════════════════════════════════════════

/** Fetch the latest USD/IRR rate and persist to fx_rates table (idempotent). */
export async function syncFxRates(sql: PostgresDb): Promise<number> {
  let rate: FxRate;
  try {
    rate = await fetchFxRate();
  } catch (e: unknown) {
    console.error(`  ✗ FX fetch failed: ${(e as Error).message.slice(0, 120)}`);
    return 0;
  }

  await sql`
    INSERT INTO fx_rates (rate_date, rate_toman, rate_rial, sources, quality, readings, fetched_at)
    VALUES (
      CURRENT_DATE,
      ${rate.rateToman},
      ${rate.rateRial},
      ${Array.from(rate.sources)}::text[],
      ${rate.quality},
      ${JSON.stringify(rate.readings)}::jsonb,
      NOW()
    )
    ON CONFLICT (rate_date) DO UPDATE SET
      rate_toman = EXCLUDED.rate_toman,
      rate_rial  = EXCLUDED.rate_rial,
      sources    = EXCLUDED.sources,
      quality    = EXCLUDED.quality,
      readings   = EXCLUDED.readings,
      fetched_at = NOW()
  `;

  console.log(
    `  ✓ FX rate: ${rate.rateToman.toLocaleString()} Toman = ${rate.rateRial.toLocaleString()} Rial/USD (${rate.quality}, sources: ${rate.sources.join(", ")})`,
  );
  return 1;
}

/** Get the nearest FX rate (Rial per USD) for a date. Forward-fallback for future dates. null → today. */
export async function getFxRateForDate(
  sql: PostgresDb,
  dateStr: string | null,
): Promise<FxRate | null> {
  const targetDate = dateStr ?? new Date().toISOString().slice(0, 10);

  const rows = await sql<
    Array<{
      rate_toman: number;
      rate_rial: number;
      sources: string[];
      quality: string;
      readings: Record<string, unknown>;
      fetched_at: Date;
    }>
  >`
    SELECT rate_toman, rate_rial, sources, quality, readings, fetched_at
    FROM fx_rates
    WHERE rate_date <= ${targetDate}::date
    ORDER BY rate_date DESC
    LIMIT 1
  `;

  let r;
  if (rows.length > 0) {
    r = rows[0];
  } else {
    // Forward fallback: nearest future date
    const f: any = await sql<
      Array<{
        rate_toman: number;
        rate_rial: number;
        sources: string[];
        quality: string;
        readings: Record<string, unknown>;
        fetched_at: Date;
      }>
    >`
      SELECT rate_toman, rate_rial, sources, quality, readings, fetched_at
      FROM fx_rates
      WHERE rate_date >= ${targetDate}::date
      ORDER BY rate_date ASC
      LIMIT 1
    `;
    if (f.length === 0) return null;
    r = f[0];
  }

  return {
    rateToman: Number(r.rate_toman),
    rateRial: Number(r.rate_rial),
    sources: (r.sources as FxSource[]) ?? [],
    quality: (r.quality as FxQualityStatus) ?? "fallback",
    readings: r.readings as Partial<Record<FxSource, number>>,
    fetchedAt: r.fetched_at.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 1b: Market-cap history (TSETMC prices × shares × FX)
// ═══════════════════════════════════════════════════════════════

/** Build daily market-cap history from TSETMC price snapshots × shares outstanding. */
export async function syncMarketCapHistory(sql: PostgresDb): Promise<number> {
  const snapshots: any = await sql`
    WITH daily_last AS (
      SELECT DISTINCT ON (symbol, DATE(timestamp))
        symbol, DATE(timestamp) AS date, last_price
      FROM prices
      ORDER BY symbol, DATE(timestamp), timestamp DESC
    )
    SELECT d.symbol, d.date, d.last_price, s.shares_outstanding
    FROM daily_last d
    JOIN stocks s ON s.symbol = d.symbol
    WHERE s.shares_outstanding IS NOT NULL
      AND d.last_price IS NOT NULL AND d.last_price > 0
    ORDER BY d.date ASC, d.symbol
  `;

  let count = 0;
  for (const row of snapshots as Array<{
    symbol: string;
    date: Date;
    last_price: number;
    shares_outstanding: number | null;
  }>) {
    const price = Number(row.last_price);
    const shares = Number(row.shares_outstanding!);
    const mcapRial = price * shares;

    const dateStr = row.date.toISOString().slice(0, 10);
    const fxRate = await getFxRateForDate(sql, dateStr).catch(() => null);
    const rateRial = fxRate?.rateRial ?? null;
    const mcapUsd = rateRial && rateRial > 0 ? mcapRial / rateRial : null;

    await sql`
      INSERT INTO market_cap_history (symbol, date, price_rial, shares_count, mcap_rial, mcap_usd,
                                      fx_rate_rial, fx_quality, fx_sources, source)
      VALUES (
        ${row.symbol}, ${dateStr}::date, ${price}, ${shares}, ${mcapRial}, ${mcapUsd},
        ${rateRial}, ${fxRate ? fxRate.quality : null},
        ${fxRate ? Array.from(fxRate.sources) : null},
        'tsetmc_fx'
      )
      ON CONFLICT (symbol, date) DO UPDATE SET
        price_rial   = EXCLUDED.price_rial,
        mcap_rial    = EXCLUDED.mcap_rial,
        mcap_usd     = EXCLUDED.mcap_usd,
        fx_rate_rial = EXCLUDED.fx_rate_rial,
        fx_quality   = EXCLUDED.fx_quality,
        fx_sources   = EXCLUDED.fx_sources,
        source       = EXCLUDED.source
    `;
    count++;
  }

  console.log(`  ✓ ${count} market-cap history points stored`);
  return count;
}

/** Fetch current price snapshots for live TSETMC symbols (used by cron). */
export async function fetchCurrentPrices(
  sql: PostgresDb,
): Promise<ResolvedInstrument[]> {
  const symbols = WATCHLIST.map((w) => w.sym);
  const out: ResolvedInstrument[] = [];
  for (const sym of symbols) {
    try {
      const snap = await tsetmc.resolveSymbol(
        sym,
        WATCHLIST_BY_SYM.get(sym)?.name ?? null,
      );
      if (snap) out.push(snap);
    } catch (e: unknown) {
      console.error(
        `  [${sym}] ✗ ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`,
      );
    }
    await sleep(DELAY_MS);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Archive/backfill helpers
// ═══════════════════════════════════════════════════════════════

export async function ingestArchiveForSymbol(
  sql: PostgresDb,
  symbol: string,
  fromJalali: string,
  toJalali: string,
): Promise<{
  lettersFound: number;
  reportsParsed: number;
  rowsUpserted: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Fetch ALL letters from Codal with pagination (API returns 20 per page).
  // NOTE: Codal's FromDate/ToDate params accept Jalali dates but don't actually
  // filter — they silently ignore them and return all results. So we paginate
  // without date filters, then let the DB upsert (ON CONFLICT) handle dedup.
  const opts: Record<string, unknown> = {};
  const allLetters: CodalLetter[] = [];
  for (let page = 1; page <= 20; page++) {
    const pageOpts = { ...opts, PageNumber: String(page) };
    const letters = await searchLetters(symbol, pageOpts);
    if (letters.length === 0) break;
    allLetters.push(...letters);
    if (letters.length < 20) break; // last page
  }
  const monthly = filterMonthlySalesLetters(allLetters);
  let reportsParsed = 0;
  let rowsUpserted = 0;

  const fxRate = await getFxRateForDate(sql, null).catch(() => null);
  const rateRial = fxRate?.rateRial ?? null;

  const toUsd = (rialMillions: number | null) =>
    rialMillions != null && rateRial && rateRial > 0
      ? (rialMillions * 1_000_000) / rateRial
      : null;

  // Process monthly reports with rate-limit-aware retry
  for (const letter of monthly) {
    try {
      // fetchReportHtml is rate-limited and 429-retried inside the scraper.
      const html = await fetchReportHtml(letter.url);
      const full = extractMonthlySalesFull(
        html,
        letter.title,
        letter.url,
        letter.publishDateTime,
      );
      if (!full) continue;
      reportsParsed++;

      const monthEnd = toIsoDate(
        jalaliToGregorian(
          full.periodEnd.jy,
          full.periodEnd.jm,
          full.periodEnd.jd,
        ),
      );

      const d: any = full.detail ?? {};
      const domRial =
        d.domesticMonthly != null ? Number(d.domesticMonthly) : null;
      const expRial = d.exportMonthly != null ? Number(d.exportMonthly) : null;
      const svcRial =
        d.serviceMonthly != null ? Number(d.serviceMonthly) : null;
      const ytdRial = full.ytdTotal != null ? Number(full.ytdTotal) : null;
      const ytdPriorRial =
        full.ytdPriorYearTotal != null ? Number(full.ytdPriorYearTotal) : null;

      await sql`
        INSERT INTO monthly_sales (symbol, month_end, sales_amount, is_estimated, source_url, fetched_at, detail,
                                   sales_usd, domestic_usd, export_usd, service_usd,
                                   ytd_total_usd, ytd_prior_year_usd,
                                   fx_rate_rial, fx_quality, fx_sources)
        VALUES (
          ${symbol}, ${monthEnd}, ${full.total}, false, ${full.url}, NOW(),
          ${JSON.stringify(full.detail ?? null)}::jsonb,
          ${toUsd(full.total)}, ${toUsd(domRial)}, ${toUsd(expRial)}, ${toUsd(svcRial)},
          ${toUsd(ytdRial)}, ${toUsd(ytdPriorRial)},
          ${rateRial}, ${fxRate ? fxRate.quality : null},
          ${fxRate ? Array.from(fxRate.sources) : null}
        )
        ON CONFLICT (symbol, month_end) DO UPDATE SET
          sales_amount = EXCLUDED.sales_amount,
          source_url  = EXCLUDED.source_url,
          fetched_at  = NOW(),
          detail      = EXCLUDED.detail,
          sales_usd     = EXCLUDED.sales_usd,
          domestic_usd  = EXCLUDED.domestic_usd,
          export_usd    = EXCLUDED.export_usd,
          service_usd   = EXCLUDED.service_usd,
          ytd_total_usd       = EXCLUDED.ytd_total_usd,
          ytd_prior_year_usd  = EXCLUDED.ytd_prior_year_usd,
          fx_rate_rial  = EXCLUDED.fx_rate_rial,
          fx_quality    = EXCLUDED.fx_quality,
          fx_sources    = EXCLUDED.fx_sources
      `;
      rowsUpserted++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${letter.title.slice(0, 80)}: ${msg.slice(0, 120)}`);
    }
  }

  return { lettersFound: monthly.length, reportsParsed, rowsUpserted, errors };
}

export async function ingestArchiveForSymbols(
  sql: PostgresDb,
  symbols: string[],
  fromJalali: string,
  toJalali: string,
): Promise<
  Array<{
    symbol: string;
    lettersFound: number;
    reportsParsed: number;
    rowsUpserted: number;
    errors: string[];
  }>
> {
  const results: Array<{
    symbol: string;
    lettersFound: number;
    reportsParsed: number;
    rowsUpserted: number;
    errors: string[];
  }> = [];

  for (const symbol of symbols) {
    const res = await ingestArchiveForSymbol(sql, symbol, fromJalali, toJalali);
    results.push({ symbol, ...res });
    await sleep(DELAY_MS);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Full pipeline
// ═══════════════════════════════════════════════════════════════

export async function runFullIngest(sql: PostgresDb): Promise<{
  fx: number;
  stocks: number;
  prices: number;
  mcap: number;
  sales: number;
  quarterly: number;
  pe: number;
}> {
  try {
    console.log("=== Phase 0: FX rate (Wallex + Nobitex) ===");
    const fxC = await syncFxRates(sql);

    console.log("\n=== Phase 1: TSETMC symbols + prices ===");
    const snapshots = await scrapeAllSymbols();
    const stocksCount = await upsertStocks(sql, snapshots);
    const priceCount = await insertPrices(sql, snapshots);

    console.log("\n=== Phase 1b: Market-cap history ===");
    const mcapCount = await syncMarketCapHistory(sql);

    console.log("\n=== Phase 2: Codal monthly sales ===");
    const salesCount = await syncMonthlySales(
      sql,
      snapshots.map((s) => s.symbol),
    );

    console.log("\n=== Phase 3: Codal quarterly financials ===");
    const quarterlyCount = await syncQuarterlyFinancials(
      sql,
      snapshots.map((s) => s.symbol),
    );

    console.log("\n=== Phase 4: Forward P/E ===");
    const peCount = await recomputeForwardPe(sql);

    console.log("\n=== Phase 5: Rankings ===");
    await refreshRankings(sql);

    return {
      fx: fxC,
      stocks: stocksCount,
      prices: priceCount,
      mcap: mcapCount,
      sales: salesCount,
      quarterly: quarterlyCount,
      pe: peCount,
    };
  } finally {
    // Close Playwright browser so Node process can exit
    await closeBrowser();
  }
}

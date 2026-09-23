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
 */

import type { FastifyInstance } from "fastify";
import postgres from "postgres";
import { tsetmc, type ResolvedInstrument } from "#scrapers/tsetmc";
import {
  fetchMonthlySales,
  fetchQuarterlyFinancials,
  closeBrowser,
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
  { sym: "فسبزوار", name: "پارس فولاد سبزوار", type: "general" },
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
  // { sym: "برکت", name: "گروه دارویی برکت", type: "general" },
  // { sym: "دتولید", name: "داروسازی تولید دارو", type: "general" },
  // { sym: "دسبحا", name: "گروه دارویی سبحان", type: "general" },
  // { sym: "دلقما", name: "دارویی لقمان", type: "general" },
  // { sym: "دعبید", name: "لابراتوار داروسازی دکتر عبیدی", type: "general" },
  // { sym: "دپارس", name: "پارس دارو", type: "general" },
  // { sym: "دیران", name: "ایران دارو", type: "general" },
  // { sym: "دالبر", name: "البرز دارو", type: "general" },

  // // ── غذایی (Food) ────────────────────────────────────
  // { sym: "غپونه", name: "نوش پونه مشهد", type: "general" },
  // { sym: "غشهد", name: "شهد ایران", type: "general" },
  // { sym: "غچین", name: "کشت و صنعت چین چین", type: "general" },
  // { sym: "غگرجی", name: "بیسکویت گرجی", type: "general" },
  // { sym: "غبهنوش", name: "بهنوش ایران", type: "general" },

  // // ── سیمان (Cement) ──────────────────────────────────
  // { sym: "ستران", name: "سیمان تهران", type: "general" },
  // { sym: "سفارس", name: "سیمان فارس و خوزستان", type: "general" },
  // { sym: "سبزوا", name: "سیمان لار سبزوار", type: "general" },

  // // ── صنعتی و سایر (Industrial & Others) ──────────────
  // { sym: "کپشیر", name: "پشم شیشه ایران", type: "general" },
  // { sym: "تپمپی", name: "پمپ‌سازی ایران", type: "general" },
  // { sym: "پلاسک", name: "پلاسکوکار", type: "general" },
  // { sym: "کسرام", name: "پارس سرام", type: "general" },
  // { sym: "کچینی", name: "کارخانه چینی ایران", type: "general" },
  // { sym: "لپارس", name: "پارس الکتریک", type: "general" },
  // { sym: "حکشتی", name: "کشتیرانی", type: "general" },
  // { sym: "تمحرکه", name: "ماشین‌سازی نیرومحرکه", type: "general" },

  // // ── بانک‌ها (Banks) ─────────────────────────────────
  // { sym: "وبملت", name: "بانک ملت", type: "bank" },
  // { sym: "وبصادر", name: "بانک صادرات", type: "bank" },
  // { sym: "وپاسار", name: "بانک پاسارگاد", type: "bank" },
  // { sym: "وتجارت", name: "بانک تجارت", type: "bank" },
  // { sym: "وبفارس", name: "بانک پارسیان", type: "bank" },
  // { sym: "وکار", name: "بانک کارآفرین", type: "bank" },
  // { sym: "وپارس", name: "بانک پارسیان", type: "bank" },
  // { sym: "ونوین", name: "بانک اقتصاد نوین", type: "bank" },
  // { sym: "وخاور", name: "بانک خاورمیانه", type: "bank" },
  // { sym: "وسینا", name: "بانک سینا", type: "bank" },
  // { sym: "وپست", name: "پست بانک", type: "bank" },

  // // ── بیمه (Insurance) ────────────────────────────────
  // { sym: "وبیمه", name: "بیمه ایران", type: "insurance" },
  // { sym: "وپارسیان", name: "بیمه پارسیان", type: "insurance" },
  // { sym: "ودی", name: "بیمه دی", type: "insurance" },
  // { sym: "ونیکی", name: "بیمه نیکان", type: "insurance" },
  // { sym: "آسیا", name: "بیمه آسیا", type: "insurance" },
  // { sym: "البرز", name: "بیمه البرز", type: "insurance" },
  // { sym: "دانا", name: "بیمه دانا", type: "insurance" },

  // // ── هلدینگ‌ها (Holdings) ────────────────────────────
  // { sym: "پارسان", name: "گسترش نفت و گاز پارسیان", type: "holding" },
  // { sym: "شستا", name: "سرمایه‌گذاری تأمین اجتماعی", type: "holding" },
  // { sym: "خگستر", name: "گسترش سرمایه‌گذاری ایران‌خودرو", type: "holding" },
  // { sym: "وغدیر", name: "سرمایه‌گذاری غدیر", type: "holding" },
  // { sym: "وامید", name: "سرمایه‌گذاری امید", type: "holding" },
  // { sym: "وصندوق", name: "سرمایه‌گذاری صندوق بازنشستگی", type: "holding" },
];

/** Fast lookup: symbol → watchlist entry. */
const WATCHLIST_BY_SYM = new Map(WATCHLIST.map((w) => [w.sym, w]));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tunables */
const DELAY_MS = 900;
const FETCH_TIMEOUT_MS = 25_000;
const RETRY_ATTEMPTS = 3;
const CODAL_CONCURRENCY = 3;

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
          fetchMonthlySales(symbol, 3),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), FETCH_TIMEOUT_MS),
          ),
        ]),
      );

      for (const s of sales) {
        const monthEnd = toIsoDate(
          jalaliToGregorian(s.periodEnd.jy, s.periodEnd.jm, s.periodEnd.jd),
        );
        await sql`
          INSERT INTO monthly_sales (symbol, month_end, sales_amount, is_estimated, source_url, fetched_at, detail)
          VALUES (${symbol}, ${monthEnd}, ${s.amount}, false, ${s.reportUrl}, NOW(), ${JSON.stringify(s.detail ?? null)}::jsonb)
          ON CONFLICT (symbol, month_end) DO UPDATE SET
            sales_amount = EXCLUDED.sales_amount,
            source_url  = EXCLUDED.source_url,
            fetched_at  = NOW(),
            detail      = EXCLUDED.detail
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
      const latestPeriod = f.latestPeriod;
      if (!latestPeriod) return;

      const idx = f.periodEnds.indexOf(latestPeriod);
      if (idx === -1) return;

      const periodEndJalali = f.periodEnds[idx];
      if (!periodEndJalali) return;

      const jy = parseInt(periodEndJalali.slice(0, 4));
      const jm = parseInt(periodEndJalali.slice(5, 7));
      const jd = parseInt(periodEndJalali.slice(8, 10));

      const periodEnd = toIsoDate(jalaliToGregorian(jy, jm, jd));

      const fiscalYear = jy;
      const quarter = Math.min(4, Math.ceil(jm / 3));

      const revenue = f.revenues[idx] ?? null;
      const netProfit = f.netProfits[idx] ?? null;
      const margin = f.margins[idx] ?? null;

      // Skip negative/zero margins (P/E would be meaningless)
      if (margin === null || margin <= 0) {
        console.log(`  [${symbol}] ✗ margin ${margin}, skipping`);
        return;
      }

      await sql`
        INSERT INTO quarterly_financials (
          symbol, fiscal_year, quarter, period_end,
          revenue, net_profit, net_margin, shares_outstanding,
          source_url, fetched_at
        )
        VALUES (
          ${symbol}, ${fiscalYear}, ${quarter}, ${periodEnd},
          ${revenue}, ${netProfit}, ${margin}, ${f.sharesOutstanding},
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

      const marginStr = (margin * 100).toFixed(1) + "%";
      console.log(`  [${symbol}] ✓ ${periodEndJalali} Q${quarter} margin=${marginStr}`);
      count++;
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
  const rows = await sql`
    WITH sales AS (
      SELECT symbol, sales_amount, month_end,
             ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY month_end DESC) AS rn
      FROM monthly_sales
    ),
    last3 AS (
      SELECT
        symbol,
        AVG(sales_amount) AS avg_sales,
        COUNT(*) FILTER (WHERE month_end > NOW() - INTERVAL '120 days') AS recent_count
      FROM sales
      WHERE rn <= 3
      GROUP BY symbol
    ),
    recent_price AS (
      SELECT DISTINCT ON (symbol) symbol, last_price
      FROM prices ORDER BY symbol, timestamp DESC
    ),
    -- latest quarterly margin per symbol (positive only, last 365 days)
    latest_quarterly AS (
      SELECT DISTINCT ON (symbol)
        symbol,
        net_margin,
        period_end
      FROM quarterly_financials
      WHERE period_end > NOW() - INTERVAL '365 days'
        AND net_margin IS NOT NULL
        AND net_margin > 0
      ORDER BY symbol, period_end DESC
    )
    SELECT
      sp.symbol,
      sp2.last_price,
      sp.shares_outstanding,
      sp.is_bank,
      sp.is_insurance,
      sp.is_holding_company,
      l3.avg_sales,
      COALESCE(l3.recent_count, 0) AS recent_count,
      lq.net_margin AS quarterly_margin,
      (lq.net_margin IS NOT NULL) AS margin_from_quarterly
    FROM stocks sp
    JOIN recent_price sp2 ON sp2.symbol = sp.symbol
    LEFT JOIN last3 l3 ON l3.symbol = sp.symbol
    LEFT JOIN latest_quarterly lq ON lq.symbol = sp.symbol
  `;

  let count = 0;

  for (const r of rows) {
    const shares = Number(r.shares_outstanding ?? 0);
    const price = Number(r.last_price ?? 0);
    const avgSales = Number(r.avg_sales ?? 0);
    const isBank = Boolean(r.is_bank);
    const isInsurance = Boolean(r.is_insurance);
    const isHolding = Boolean(r.is_holding_company);
    const isFinancial = isBank || isInsurance || isHolding;
    const recentCount = Number(r.recent_count ?? 0);

    const quarterlyMargin =
      r.quarterly_margin != null ? Number(r.quarterly_margin) : null;
    const marginFromQuarterly = Boolean(r.margin_from_quarterly);
    const defaultMargin = isBank
      ? 0.15
      : isInsurance
        ? 0.08
        : isHolding
          ? 0.05
          : 0.06;
    const margin =
      quarterlyMargin !== null && quarterlyMargin > 0
        ? quarterlyMargin
        : defaultMargin;

    let eps: number | null = null;
    let pe: number | null = null;
    let confidence = "non_calculable";
    let confidenceScore = 0;
    let disclaimer = "";
    let method = "monthly_sales_sector_margin";

    if (isFinancial && !marginFromQuarterly) {
      disclaimer =
        "برای بانک/بیمه/هلدینگ، محاسبه P/E Forward نیازمند صورت مالی فصلی است.";
    } else if (price > 0 && shares > 0 && avgSales > 0 && margin > 0) {
      const annualSales = avgSales * 12 * 1_000_000;
      eps = (annualSales * margin) / shares;

      if (eps > 0) {
        pe = price / eps;

        if (recentCount >= 3) {
          confidenceScore = 0.75;
          confidence = "high";
        } else if (recentCount === 2) {
          confidenceScore = 0.55;
          confidence = "medium";
        } else if (recentCount === 1) {
          confidenceScore = 0.35;
          confidence = "low";
        } else {
          confidenceScore = 0.15;
          confidence = "low";
        }

        if (marginFromQuarterly) {
          confidenceScore = Math.min(1.0, confidenceScore + 0.25);
          if (confidenceScore >= 0.75) confidence = "high";
          else if (confidenceScore >= 0.4) confidence = "medium";
          else confidence = "low";
          method = "quarterly_margin";
        }

        const marginSource = marginFromQuarterly
          ? `حاشیه سود واقعی فصلی (${(margin * 100).toFixed(1)}٪)`
          : `حاشیه سود پیش‌فرض صنعتی (${(margin * 100).toFixed(1)}٪)`;

        disclaimer =
          `برآورد بر اساس ${recentCount} گزارش فروش ماهانه اخیر کدال ` +
          `و ${marginSource}. ` +
          `⚠️ این یک برآورد است، نه پیش‌بینی قیمت.`;
      }
    } else {
      disclaimer =
        "داده‌های قیمت، سهام یا فروش ماهانه کافی موجود نیست. P/E Forward غیرقابل محاسبه.";
    }

    await sql`
      INSERT INTO forward_pe (symbol, calculated_at, estimated_annual_eps, forward_pe,
                              confidence, confidence_score, method, margin_used, disclaimer)
      VALUES (${r.symbol}, NOW(), ${eps}, ${pe}, ${confidence}, ${confidenceScore},
              ${method}, ${margin}, ${disclaimer})
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
// Full pipeline
// ═══════════════════════════════════════════════════════════════

export async function runFullIngest(sql: PostgresDb): Promise<{
  stocks: number;
  prices: number;
  sales: number;
  quarterly: number;
  pe: number;
}> {
  try {
    console.log("=== Phase 1: TSETMC symbols + prices ===");
    const snapshots = await scrapeAllSymbols();
    const stocksCount = await upsertStocks(sql, snapshots);
    await insertPrices(sql, snapshots);

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
      stocks: stocksCount,
      prices: snapshots.length,
      sales: salesCount,
      quarterly: quarterlyCount,
      pe: peCount,
    };
  } finally {
    // Close Playwright browser so Node process can exit
    await closeBrowser();
  }
}

export function registerIngestRoutes(server: FastifyInstance): void {
  server.get("/api/admin/ingest", async (req, reply) => {
    const ip = req.ip;
    if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
      return reply.code(403).send({ error: "Forbidden (localhost only)" });
    }

    try {
      const result = await runFullIngest(server.db);
      return reply.send({ ok: true, ...result });
    } catch (e: unknown) {
      server.log.error(e);
      return reply.code(500).send({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
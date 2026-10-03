// Server-side (SSR) should use INTERNAL_API_URL when available so fetches
// stay inside the compose network (http://api:8001/api) instead of going
// through the public origin. Client keeps NEXT_PUBLIC_API_URL.
const API_URL =
  (typeof window === "undefined" && process.env.INTERNAL_API_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8001/api";

/* ---------- Types ---------- */

export interface SuggestionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SuggestionFull {
  headline: string;
  analysis: string;
  quantitativeReasoning: string;
  uncertaintyDisclosure: string;
  riskFactors: string[];
  positiveFactors: string[];
  disclaimer: string;
  usage?: SuggestionUsage;
  // fallback fields (present only when LLM failed for this item)
  symbol?: string;
  fallback?: true;
  error?: string;
  rawData?: {
    symbol: string;
    name: string;
    sector: string;
    last_price: string;
    volume: string;
    forward_pe: string;
    estimated_annual_eps: string;
    confidence: "high" | "medium" | "low";
    confidence_score: string;
    disclaimer: string;
    calcDetails: unknown | null;
    attractiveness_score: string;
    overallRank: string;
  };
}

export interface SuggestionsResponse {
  data: SuggestionFull[];
  meta: {
    total: number;
    topN: number;
    minConfidence: "high" | "medium" | "low";
    sectorFilter: string | null;
    llmFailed: boolean;
  };
  generatedAt: string;
  model: string;
}

export interface RankingItem {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: string;
  dailyVolume: string;
  /** null when the P/E could not be computed honestly. */
  forwardPe: string | null;
  estimatedAnnualEps: string | null;
  confidence: "high" | "medium" | "low" | "non_calculable";
  confidenceScore: string;
  attractivenessScore: string;
  rank: string;
  priceChangePercent: string | null;
}

export interface RankingsMeta {
  count: number;
  filters: { limit: number };
  generatedAt: string;
  source: string;
}

export interface RankingsResponse {
  data: RankingItem[];
  meta: RankingsMeta;
}

export interface SectorSummary {
  sector: string;
  stock_count: number;
  avg_forward_pe: number | null;
  avg_confidence: string;
  median_forward_pe: number | null;
  median_score: number;
}

export interface SectorsResponse {
  data: SectorSummary[];
  generatedAt: string;
}

/* ---------- Detail types (for /stocks/[symbol]) ---------- */

export interface StockPrice {
  last: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  value: number;
  timestamp: string;
  isStale: boolean;
}

/**
 * Audit trail for a forward P/E, mirrored from `forward_pe.calculation_json`.
 * Always present, but most fields are null when the P/E could not be computed.
 */
export interface ForwardPeSources {
  basis?: "last_3_months_annualised_x4" | string;
  baseline_basis?: "last_12_months_sum" | string;
  /** Sales for the most recent 3 months, in million Rial. */
  quarterlySales?: number | null;
  /** quarterlySales × 4 — the annualised run-rate the headline P/E uses. */
  yearlySales?: number | null;
  hasFullQuarter?: boolean;
  monthCount?: number | null;
  /** Trailing 12-month sales, million Rial — the conservative basis. */
  yearlySales12?: number | null;
  hasFullYear?: boolean;
  monthCount12?: number | null;
  /** P/E on the trailing-12-month basis. Compare against `forwardPe`. */
  pe12?: number | null;
  /** EPS on the trailing-12-month basis, Rial. */
  eps12?: number | null;
  /** Net margin as a fraction (0.34 = 34%). */
  quarterlyMargin?: number | null;
  marginSource?: string;
}

export interface StockForwardPe {
  /** null when the P/E could not be computed honestly (see `method`). */
  forwardPe: number | null;
  estimatedAnnualEps: number | null;
  confidence: "high" | "medium" | "low" | "non_calculable";
  confidenceScore: number;
  method: string | null;
  sources: ForwardPeSources | null;
  disclaimer: string | null;
}

export interface SalesReport {
  monthEnd: string;
  salesAmount: number;
  isEstimated: boolean;
  sourceUrl: string;
  fetchedAt: string;
  detail: {
    periodEnd: string;
    /** Current-year YTD total for this fiscal year, not the row's sum. */
    ytdSalesTotal: number | null;
    priorYtdSalesTotal: number | null;
    /** Domestic/export split of the current month's sales. */
    domesticMonthly: number | null;
    exportMonthly: number | null;
    /** Product-level rows — one per (product × rowType). Null qty = "not disclosed". */
    goods: Array<{
      rowCode: number;
      label: string;
      qtyPeriod: number | null;
      valuePeriod: number;
      qtyYtd: number | null;
      valueYtd: number;
      qtyPriorYtd: number | null;
      valuePriorYtd: number;
      rowTypeName: string;
    }>;
  };
}

export interface StockDetail {
  symbol: string;
  name: string;
  nameEn: string | null;
  sector: string;
  isin: string;
  isBank: boolean;
  isInsurance: boolean;
  isHoldingCompany: boolean;
  sharesOutstanding: string;
  price: StockPrice;
  forwardPe: StockForwardPe;
  salesHistory: SalesReport[];
}

/* ---------- Errors ---------- */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---------- Internals ---------- */

function buildUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
) {
  const url = new URL(path, API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new ApiError(404, "یافت نشد");
    if (res.status >= 500) throw new ApiError(res.status, "خطای سرور");
    throw new ApiError(res.status, "خطا در دریافت اطلاعات");
  }
  return res.json() as Promise<T>;
}

/* ---------- Public API ---------- */

export function fetchRankings(limit = 50): Promise<RankingsResponse> {
  return request<RankingsResponse>(buildUrl("/api/rankings/", { limit }));
}

/**
 * Search by symbol/name. If your backend doesn't support `q`,
 * this will just return unfiltered results — filter client-side instead
 * (see `page.tsx` `filtered` useMemo).
 */
export function searchRankings(
  q: string,
  limit = 50,
): Promise<RankingsResponse> {
  return request<RankingsResponse>(buildUrl("/api/rankings/", { q, limit }));
}

export function fetchStockDetail(symbol: string): Promise<StockDetail> {
  return request<StockDetail>(
    buildUrl(`/api/stocks/${encodeURIComponent(symbol)}`),
  );
}

export function fetchSectors(): Promise<SectorsResponse> {
  return request<SectorsResponse>(buildUrl("/api/rankings/sectors"));
}

export function fetchSuggestions(params?: {
  topN?: number;
  minConfidence?: "high" | "medium" | "low";
  sector?: string;
}): Promise<SuggestionsResponse> {
  return request<SuggestionsResponse>(
    buildUrl("/api/suggestions/", {
      top_n: params?.topN ?? 20,
      min_confidence: params?.minConfidence ?? "medium",
      sector: params?.sector,
    }),
  );
}

export interface SalesTrendItem {
  symbol: string;
  name: string;
  sector: string;
  change_percent?: string | number;
  growth_percent?: string | number;
  current_sales?: string | number;
  previous_sales?: string | number;
  ytd_sales?: string | number;
  prior_ytd_sales?: string | number;
  month_end?: string;
}

export interface SalesTrendsResponse {
  gainers: SalesTrendItem[];
  losers: SalesTrendItem[];
  cumulative: SalesTrendItem[];
  meta: {
    latestMonth?: string;
    previousMonth?: string;
    generatedAt?: string;
    message?: string;
  };
}

export async function fetchSalesTrends(): Promise<SalesTrendsResponse> {
  const res = await fetch(`${API_URL}/sales-trends/`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch sales trends: ${res.status}`);
  return res.json();
}

// ─── Sectors list ───────────────────────────────────────

export interface SectorItem {
  sector: string;
  stock_count: number;
  avg_forward_pe: number | null;
  high_confidence_count: number;
  median_attractiveness: number | null;
  top_symbol: string | null;
}

export interface SectorsListResponse {
  data: SectorItem[];
  meta: {
    total: number;
    totalStocks: number;
    generatedAt: string;
  };
}

export async function fetchSectorsList(): Promise<SectorsListResponse> {
  const res = await fetch(`${API_URL}/sectors`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch sectors: ${res.status}`);
  return res.json();
}

// ─── Sector detail (assets) ─────────────────────────────

export interface SectorAsset {
  symbol: string;
  name: string;
  market_cap: number | null;
  forward_pe: number | null;
  dps: number | null;
  eps: number | null;
  eps_growth: number | null;
  net_margin: number | null;
  sales_growth_mom: number | null;
  sales_growth_ytd: number | null;
  return_1y: number | null;
  last_price: number | null;
}

export interface SectorAssetsResponse {
  sector: string;
  data: SectorAsset[];
  meta: {
    total: number;
    generatedAt: string;
  };
}

export async function fetchSectorAssets(
  sector: string,
): Promise<SectorAssetsResponse> {
  const url = `${API_URL}/sectors/${encodeURIComponent(sector)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch sector assets: ${res.status}`);
  return res.json();
}

export interface PricePoint {
  t: string;
  p: number;
}

export interface PriceHistoryResponse {
  symbol: string;
  points: PricePoint[];
  meta: {
    count: number;
    from: string | null;
    to: string | null;
  };
}

// ─── Price history ──────────────────────────────────

export async function fetchPriceHistory(
  symbol: string,
  days = 90,
): Promise<PriceHistoryResponse> {
  const url = `${API_URL}/prices/${encodeURIComponent(symbol)}?days=${days}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch price history: ${res.status}`);
  return res.json();
}

// ─── Monthly chart (3 years) ────────────────────────
/**
 * Calendar-grid view: 12 columns (months) × N rows (Jalali years).
 * Used by the sector/year heatmap panel.
 */

export interface MonthlyYear {
  jy: number;
  values: (number | null)[];
  valuesUsd?: (number | null)[];
  ytdTotal: number | null;
  priorYtdTotal: number | null;
  fxQuality?: string;
}

export interface MonthlyChartResponse {
  symbol: string;
  years: MonthlyYear[];
  months: string[];
  meta: { count: number };
}

export async function fetchMonthlyChart(
  symbol: string,
): Promise<MonthlyChartResponse> {
  const url = `${API_URL}/prices/${encodeURIComponent(symbol)}/monthly-chart`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch monthly chart: ${res.status}`);
  return res.json();
}

export interface QuarterlyPoint {
  label: string; // e.g. "به ۱۴۰۳"
  pe: number | null;
  period_end: string;
}

export interface QuarterlyHistoryResponse {
  symbol: string;
  points: QuarterlyPoint[];
}

export async function fetchQuarterlyHistory(
  symbol: string,
): Promise<QuarterlyHistoryResponse> {
  const url = `${API_URL}/quarterly/${encodeURIComponent(symbol)}/history`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { symbol, points: [] };
  return res.json();
}

// ─── Earnings / Dividends ───────────────────────────────

export interface QuarterlyEarning {
  period_end: string;
  fiscal_year: number;
  quarter: number;
  label: string;
  eps_rials: number | null;
  net_profit_millions: number | null;
  net_margin: number | null;
  revenue_millions: number | null;
}

export interface EarningsSummary {
  latest_eps: number | null;
  latest_margin: number | null;
  eps_growth_yoy: number | null;
  net_profit_growth_yoy: number | null;
  dividend_per_share: number | null;
  dividend_payout_ratio: number | null;
}

export interface EarningsResponse {
  symbol: string;
  quarterly: QuarterlyEarning[];
  summary: EarningsSummary;
  meta: { count: number; generatedAt: string };
}

export async function fetchEarnings(symbol: string): Promise<EarningsResponse> {
  const url = `${API_URL}/earnings/${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch earnings: ${res.status}`);
  return res.json();
}

// ─── Market-cap series (TSETMC price × shares × Wallex FX) ─────────

export type FxQualityStatus = "valid" | "fallback" | "suspicious";

export interface McapPoint {
  date: string;
  priceRial: number | null;
  mcapRial: number | null;
  mcapUsd: number | null;
  /** Toman per 1 USD */
  fxRateToman: number | null;
  fxSources: string[];
  fxQualityStatus: FxQualityStatus;
  source: string;
}

export interface McapSeriesResponse {
  symbol: string;
  companyName: string | null;
  sharesCount: number | null;
  points: McapPoint[];
  lastTrading: {
    date: string | null;
    /** Market cap in units of 10 billion Rial */
    value: number | null;
    /** Absolute USD */
    valueUsd: number | null;
  } | null;
  meta: {
    count: number;
    from: string | null;
    to: string | null;
    dataDensity: "daily" | "monthly" | "sparse" | "none";
    fxQuality: string;
  };
}

export async function fetchMcapSeries(
  symbol: string,
  days = 90,
): Promise<McapSeriesResponse> {
  const url = `${API_URL}/mcap-series/${encodeURIComponent(symbol)}?days=${days}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch mcap series: ${res.status}`);
  return res.json();
}

export interface McapSummary {
  symbol: string;
  date: string;
  priceRial: number;
  sharesCount: number;
  mcapRial: number;
  mcapUsd: number | null;
  fxRateToman: number | null;
  fxQualityStatus: FxQualityStatus;
}

export async function fetchMcapSummary(
  symbol: string,
): Promise<McapSummary | null> {
  const url = `${API_URL}/mcap-series/${encodeURIComponent(symbol)}/summary`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.error ? null : data;
}

// ─── Monthly sales series (Codal Rial + USD) ────────────────────

export interface MonthlySalesEntry {
  monthEnd: string;
  jy: number;
  jm: number;
  totalRial: number | null;
  totalUsd: number | null;
  domesticRial: number | null;
  domesticUsd: number | null;
  exportRial: number | null;
  exportUsd: number | null;
  serviceRial: number | null;
  serviceUsd: number | null;
  ytdTotalRial: number | null;
  ytdTotalUsd: number | null;
  ytdPriorYearRial: number | null;
  ytdPriorYearUsd: number | null;
  fxRateToman: number | null;
  fxQualityStatus: FxQualityStatus;
  fxSources: string[];
  reportUrl: string | null;
}

export interface MonthlySalesResponse {
  symbol: string;
  /** Chronological order (oldest → newest), as returned by the API. */
  months: MonthlySalesEntry[];
  ytdTotalRial: number | null;
  ytdTotalUsd: number | null;
  meta: { count: number };
}

export async function fetchMonthlySales(
  symbol: string,
  months = 36,
): Promise<MonthlySalesResponse> {
  const url = `${API_URL}/mcap-series/${encodeURIComponent(symbol)}/sales?months=${months}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch monthly sales: ${res.status}`);
  return res.json();
}

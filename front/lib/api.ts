const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
  forwardPe: string;
  estimatedAnnualEps: string;
  confidence: "high" | "medium" | "low";
  confidenceScore: string;
  attractivenessScore: string;
  rank: string;
  priceChangePercent: string;
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
  stock_count: string;
  avg_forward_pe: string;
  avg_confidence: string;
  median_forward_pe: number;
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

export interface StockForwardPe {
  forwardPe: number;
  estimatedAnnualEps: number;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  method: string;
  sources: unknown[] | null;
  disclaimer: string;
}

export interface SalesReport {
  monthEnd: string;
  salesAmount: number;
  isEstimated: boolean;
  sourceUrl: string;
  fetchedAt: string;
  ytdSalesTotal: number;
  priorYtdSalesTotal: number;
  domesticMonthly: number;
  exportMonthly: number;
  productCount: number;
  detail: {
    periodEnd: string;
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
    totals: Array<{
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
    monthlySalesTotal: number;
    ytdSalesTotal: number;
    priorYtdSalesTotal: number;
    domesticMonthly: number;
    exportMonthly: number;
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

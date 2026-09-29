"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  StockDetail,
  McapSummary,
  fetchMcapSummary,
  MonthlySalesResponse,
  MonthlySalesEntry,
  fetchMonthlySales,
} from "@/lib/api";
import { faPrice } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { MarketCapTab } from "./stock-tabs/market-cap-chart";
import { MonthlyChartTab } from "./stock-tabs/monthly-chart";
import { FinancialsTab } from "./stock-tabs/financials";
import { MoneyFlowTab } from "./stock-tabs/money-flow";
import { RatiosTab } from "./stock-tabs/ratios";
import { DividendsTab } from "./stock-tabs/dividends";

function faNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("fa-IR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function faPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits).replace(".", "٫")}٪`;
}

const TABS = [
  { id: "market_cap", label: "ارزش بازار", icon: "💹" },
  { id: "monthly", label: "گزارش فعالیت ماهانه", icon: "🛒", expandable: true },
  { id: "financials", label: "اطلاعات صورت‌های مالی", icon: "📅", expandable: true },
  { id: "money_flow", label: "جریان پول حقیقی", icon: "📊" },
  { id: "dividends", label: "روند سود انباشته و تقسیم سود", icon: "📈" },
  { id: "ratios", label: "نسبت‌های ارزش‌گذاری", icon: "💹" },
  { id: "orderbook", label: "تابلو خوانی", icon: "📋" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function StockDetailView({ stock }: { stock: StockDetail }) {
  const [activeTab, setActiveTab] = useState<TabId>("market_cap");
  const [watched, toggleWatched] = useWatchlist(stock.symbol);
  const [mcapUsd, setMcapUsd] = useState<number | null>(null);
  const [sales, setSales] = useState<MonthlySalesResponse | null>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const [unit, setUnit] = useState<"rial" | "usd">("usd");

  const marketCap =
    stock.price.last && stock.sharesOutstanding
      ? (stock.price.last * Number(stock.sharesOutstanding)) / 1e9
      : null;

  const mcapLabel = mcapUsd
    ? `${(mcapUsd / 1e6).toFixed(0)}M $`
    : marketCap !== null
      ? `${faNum(marketCap, 0)} همت`
      : "—";

  const fpe = stock.forwardPe;
  const fpeSources = fpe?.sources ?? {};
  const fpeConfidence = fpe?.confidence ?? "non_calculable";
  const fpeConfidenceScore = fpe?.confidenceScore ?? 0;

  // Headline P/E is the recent-run-rate basis; the trailing-12m figure is the
  // conservative counterpart. When they diverge the cheaper one is doing more
  // assuming, so the gap is surfaced rather than hidden.
  const peRecent = fpe?.forwardPe ?? null;
  const pe12 = fpeSources.pe12 ?? null;
  const peDivergence =
    peRecent != null && pe12 != null && pe12 > 0
      ? ((peRecent - pe12) / pe12) * 100
      : null;

  // Short, human label for the calculation method shown in the card subline.
  const peMethodFa = (() => {
    const m = fpe?.method;
    if (!m) return null;
    if (m === "last3m_annualised") return "سالانه‌سازی ۳ ماه";
    if (m === "last3m_avg_annualised") return "میانگین ۳ ماه × ۴";
    if (m === "last3m_annualised_assumed_margin") return "۳ ماه (حاشیه فرضی)";
    if (m === "unavailable") return "بدون داده فصلی";
    return m;
  })();

  // Subline text for the P/E metric card. Conveys basis + confidence context
  // even when the headline number itself is missing.
  const peSub = peRecent != null
    ? pe12 != null
      ? `مبنای ۳ ماه × ۴${peMethodFa ? ` · ${peMethodFa}` : ""}${peDivergence != null ? ` · ${peDivergence >= 0 ? "+" : ""}${peDivergence.toFixed(0)}٪ vs ۱۲‌ماهه` : ""}`
      : peMethodFa
        ? `مبنای ${peMethodFa}`
        : undefined
    : peMethodFa
      ? `P/E: ${peMethodFa}`
      : "بدون داده صورت‌های مالی";

  useEffect(() => {
    const ac = new AbortController();
    fetchMcapSummary(stock.symbol)
      .then((r) => {
        if (r && !ac.signal.aborted) setMcapUsd(r.mcapUsd);
      })
      .catch(() => { });
    return () => ac.abort();
  }, [stock.symbol]);

  useEffect(() => {
    setLoadingSales(true);
    fetchMonthlySales(stock.symbol, 36)
      .then((d) => setSales(d))
      .catch(() => setSales(null))
      .finally(() => setLoadingSales(false));
  }, [stock.symbol]);

  // Latest month stats (for hero card)
  const latest = sales?.months?.[sales.months.length - 1];
  const latestYtd = latest?.ytdTotalRial ?? null;
  const latestPriorYtd = latest?.ytdPriorYearRial ?? null;
  const ytdGrowth =
    latestYtd != null && latestPriorYtd != null && latestPriorYtd > 0
      ? ((latestYtd - latestPriorYtd) / latestPriorYtd) * 100
      : null;

  return (
    <main className="flex-1 bg-app">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] text-muted flex-wrap">
          <Link href="/" className="hover:text-fg">خانه</Link>
          <span className="opacity-50">›</span>
          <Link
            href={`/stocks?sector=${encodeURIComponent(stock.sector)}`}
            className="hover:text-fg"
          >
            {stock.sector}
          </Link>
          <span className="opacity-50">›</span>
          <span className="text-fg font-semibold">{stock.symbol}</span>
        </div>

        {/* Header card */}
        <div className="rounded-3xl bg-gradient-to-l from-brand-50/70 via-surface to-teal-50/50 dark:from-brand-500/8 dark:via-surface dark:to-teal-500/8 border border-brand-100 dark:border-brand-500/15 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 17l6-6 4 4 8-8" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-fg">{stock.name}</h1>
                <div className="flex items-center gap-2 text-xs text-muted mt-1 flex-wrap">
                  <span className="font-semibold">{stock.symbol}</span>
                  <span className="opacity-50">•</span>
                  <span>ISIN: {stock.isin ?? "—"}</span>
                  <span className="opacity-50">•</span>
                  <span>سرمایه: {faShares(Number(stock.sharesOutstanding))}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={watched}
                onClick={toggleWatched}
                className={watched
                  ? "text-[11px] px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-500/10 border border-app text-brand-700 dark:text-brand-400 hover:border-brand-300 dark:hover:border-brand-500/40 transition flex items-center gap-1.5"
                  : "text-[11px] px-3 py-1.5 rounded-full bg-surface border border-app text-muted hover:text-fg hover:border-brand-300 dark:hover:border-brand-500/40 transition flex items-center gap-1.5"}
              >
                <span aria-hidden="true">{watched ? "★" : "☆"}</span>
                افزودن به واچ‌لیست
              </button>
              <span className={`text-[11px] px-3 py-1.5 rounded-full border ${stock.price.isStale
                ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400"
                : "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/30 text-brand-700 dark:text-brand-400"
                }`}>
                {stock.price.isStale ? "⚠ قیمت قدیمی" : "✓ قیمت به‌روز"}
              </span>
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="ارزش بازار"
            value={mcapLabel}
            icon="💹"
            iconColor="text-emerald-600 dark:text-emerald-400"
            iconBg="bg-emerald-50 dark:bg-emerald-500/10"
          />
          <MetricCard
            label="P/E آینده‌نگر"
            value={peRecent?.toFixed(2) ?? "—"}
            sub={peSub}
            icon="📊"
            iconColor="text-brand-600 dark:text-brand-400"
            iconBg="bg-brand-50 dark:bg-brand-500/10"
            accent={
              peRecent == null
                ? "text-muted"
                : peDivergence != null && Math.abs(peDivergence) > 25
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-brand-600 dark:text-brand-400"
            }
          />
          <MetricCard
            label="حاشیه سود فصلی"
            value={
              fpeSources.quarterlyMargin != null
                ? faPercent(fpeSources.quarterlyMargin * 100, 1)
                : "—"
            }
            sub={fpe?.sources?.marginSource ?? undefined}
            icon="%"
            iconColor="text-amber-600 dark:text-amber-400"
            iconBg="bg-amber-50 dark:bg-amber-500/10"
          />
          <MetricCard
            label="رشد فروش YTD"
            value={ytdGrowth != null ? `${ytdGrowth >= 0 ? "▲" : "▼"} ${faPercent(Math.abs(ytdGrowth), 1)}` : "—"}
            sub={latestYtd != null ? `YTD: ${faNum(latestYtd)} م.ر` : undefined}
            accent={
              ytdGrowth == null
                ? "text-fg"
                : ytdGrowth >= 0
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-red-600 dark:text-red-400"
            }
            icon="📈"
            iconColor="text-slate-600 dark:text-slate-400"
            iconBg="bg-slate-50 dark:bg-slate-500/10"
          />
        </div>

        {/* Forward P/E confidence strip */}
        {fpe && (
          <div className="rounded-3xl bg-surface border border-app p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm ${fpeConfidence === "high"
                ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : fpeConfidence === "medium"
                  ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : fpeConfidence === "non_calculable"
                    ? "bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
                    : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                {fpeConfidence === "high" ? "✓" : fpeConfidence === "medium" ? "⚠" : fpeConfidence === "non_calculable" ? "—" : "!"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="text-sm font-bold text-fg">برآورد P/E آینده‌نگر</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${fpeConfidence === "high"
                    ? "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400"
                    : fpeConfidence === "medium"
                      ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : fpeConfidence === "non_calculable"
                        ? "bg-slate-50 dark:bg-slate-500/15 text-slate-700 dark:text-slate-400"
                        : "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400"
                    }`}>
                    {fpeConfidence === "high" ? "بالا" : fpeConfidence === "medium" ? "متوسط" : fpeConfidence === "non_calculable" ? "غیرقابل محاسبه" : "پایین"} {fpeConfidence !== "non_calculable" ? `(${faNum(fpeConfidenceScore * 100, 0)}٪)` : ""}
                  </span>
                </div>

                {fpeConfidence === "non_calculable" ? (
                  <p className="text-[11px] leading-6 text-muted">
                    {fpe.disclaimer ?? "صورت مالی فصلی برای این نماد در دسترس نیست — P/E آینده‌نگر محاسبه نشد."}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <Pill label="EPS برآوردی" value={`${faNum(fpe.estimatedAnnualEps ?? 0)} ر`} />
                      <Pill label="فروش فصلی" value={`${faNum(fpeSources.quarterlySales ?? 0)} م.ر`} />
                      <Pill label="فروش ۱۲ ماهه" value={`${faNum(fpeSources.yearlySales12 ?? 0)} م.ر`} />
                      <Pill label="روش" value={fpe.method === "last3m_annualised" ? "سالانه‌سازی ۳ ماه" : (fpe.method ?? "—")} />
                    </div>

                    {pe12 != null && (
                      <div className={`mb-3 rounded-xl border px-3 py-2 text-[11px] flex items-center justify-between gap-2 flex-wrap ${Math.abs(peDivergence ?? 0) > 25
                        ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300"
                        : "bg-surface-2 border-app text-muted"
                        }`}>
                        <span>مقایسه مبناها: <strong className="tabular text-fg">۳ ماه × ۴ = {peRecent!.toFixed(2)}</strong> · <span className="tabular">۱۲ ماه = {pe12.toFixed(2)}</span></span>
                        {peDivergence != null && (
                          <span className={`font-semibold tabular ${peDivergence < 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"}`}>
                            {peDivergence >= 0 ? "+" : ""}{peDivergence.toFixed(0)}٪
                          </span>
                        )}
                      </div>
                    )}

                    {peDivergence != null && Math.abs(peDivergence) > 25 && (
                      <p className="text-[10px] leading-6 text-amber-700 dark:text-amber-400 mb-2">
                        ⚠️ فاصله دو مبنا معنادار است — عدد ارزان‌تر بر فرض تداوم فروش ماه‌های اخیر استوار است.
                      </p>
                    )}

                    <p className="text-[11px] leading-6 text-muted">
                      {fpe.disclaimer}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Summary box */}
        <div className="rounded-3xl bg-gradient-to-l from-brand-50/50 to-teal-50/30 dark:from-brand-500/5 dark:to-teal-500/5 border border-brand-100 dark:border-brand-500/15 p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-brand-700 dark:text-brand-400 mb-2">
                خلاصه بنیادی {stock.symbol}
              </h2>
              <p className="text-xs sm:text-[13px] text-muted leading-7">
                {stock.name} در گروه <strong className="text-fg">{stock.sector}</strong> بورس تهران فعالیت می‌کند؛
                ارزش بازار آن <strong className="text-fg">{mcapLabel}</strong>{" "}
                {peRecent != null && (
                  <>و P/E آینده‌نگر آن <strong className="text-fg">{peRecent.toFixed(2)}</strong>{" "}</>
                )}
                {pe12 != null && (
                  <>(بر مبنای ۱۲ ماه اخیر {pe12.toFixed(2)}){" "}</>
                )}
                {ytdGrowth != null && (
                  <>با رشد فروش YTD <strong className={ytdGrowth >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"}>{faPercent(ytdGrowth, 1)}</strong>{" "}</>
                )}
                {ytdGrowth != null
                  ? " نسبت به مدت مشابه سال قبل است."
                  : " است."}
              </p>
            </div>
          </div>
        </div>

        {/* Tab layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <aside className="rounded-3xl bg-surface border border-app p-3 lg:col-span-1 lg:sticky lg:top-20 lg:self-start">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-semibold text-muted">معرفی شرکت</p>
            </div>
            <nav role="tablist" className="space-y-1">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => {
                      if (e.altKey) return;
                      const idx = TABS.findIndex((t) => t.id === tab.id);
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveTab(TABS[(idx + 1) % TABS.length]!.id);
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length]!.id);
                      }
                    }}
                    className={`w-full text-right px-3 py-2.5 rounded-2xl text-xs transition flex items-center justify-between gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${active
                      ? "bg-brand-600 text-white font-semibold shadow-sm"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </span>
                    {active && (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="lg:col-span-3 space-y-4"
          >
            {activeTab === "market_cap" && <MarketCapTab symbol={stock.symbol} />}
            {activeTab === "monthly" && <MonthlyChartTab symbol={stock.symbol} />}
            {activeTab === "financials" && <FinancialsTab stock={stock} />}
            {activeTab === "money_flow" && <MoneyFlowTab symbol={stock.symbol} />}
            {activeTab === "dividends" && <DividendsTab symbol={stock.symbol} />}
            {activeTab === "ratios" && <RatiosTab stock={stock} />}
            {activeTab === "orderbook" && (
              <div className="rounded-3xl bg-surface border border-app p-10 text-center">
                <div className="text-4xl mb-3 opacity-40">📋</div>
                <h3 className="text-sm font-bold text-fg mb-2">تابلو خوانی</h3>
                <p className="text-xs text-muted leading-6 max-w-md mx-auto">
                  داده تابلوی خوانی نیازمند اتصال به API سفارشات TSETMC است. در حال تکمیل.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Price snapshot */}
        <div className="rounded-3xl bg-surface border border-app p-5">
          <h2 className="text-sm font-bold text-fg mb-4">تصویر لحظه‌ای قیمت</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label="آخرین قیمت" value={faPrice(stock.price.last)} accent="text-fg" />
            <MiniStat label="بالاترین" value={stock.price.high ? faPrice(stock.price.high) : "—"} />
            <MiniStat label="پایین‌ترین" value={stock.price.low ? faPrice(stock.price.low) : "—"} />
            <MiniStat label="حجم" value={faNum(stock.price.volume)} />
            <MiniStat label="ارزش معاملات" value={faNum(stock.price.value)} />
            <MiniStat label="سهام منتشرشده" value={faShares(Number(stock.sharesOutstanding))} />
            <MiniStat label="ISIN" value={stock.isin ?? "—"} />
            <MiniStat
              label="آخرین به‌روزرسانی"
              value={
                stock.price.timestamp
                  ? new Date(stock.price.timestamp).toLocaleString("fa-IR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                  : "—"
              }
            />
          </div>
        </div>

        {/* Sales history */}
        <div className="rounded-3xl bg-surface border border-app p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-fg">تاریخچه فروش ماهانه</h2>
              {sales && (
                <p className="text-[10px] text-muted mt-0.5">
                  {faNum(sales.meta.count)} گزارش از کدال
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {sales && sales.ytdTotalRial != null && (
                <span className="px-2.5 py-1 rounded-lg bg-surface-2 border border-app text-[10px] text-muted tabular">
                  YTD:{" "}
                  {unit === "usd" && sales.ytdTotalUsd
                    ? `$${(sales.ytdTotalUsd / 1e6).toFixed(1)}M`
                    : `${faNum(sales.ytdTotalRial)} م.ر`}
                </span>
              )}
              {sales && <UnitToggle unit={unit} onChange={setUnit} />}
            </div>
          </div>

          {loadingSales ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl skeleton" />
              ))}
            </div>
          ) : !sales || sales.months.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2 opacity-30">📭</div>
              <p className="text-xs text-muted">گزارش فروش ماهانه موجود نیست</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...sales.months].slice().reverse().map((m, idx, arr) => (
                <SalesRowUsd key={m.monthEnd} entry={m} prev={arr[idx + 1]} unit={unit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ---------- Subcomponents ---------- */

function MetricCard({
  label,
  value,
  sub,
  icon,
  iconColor,
  iconBg,
  accent = "text-fg",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  accent?: string;
}) {
  return (
    <div className="rounded-3xl bg-surface border border-app p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] text-muted mb-1 truncate">{label}</p>
        <p className={`text-xl font-bold tabular ${accent} truncate`}>{value}</p>
        {sub && <p className="text-[10px] text-muted mt-0.5 truncate">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-2xl ${iconBg} ${iconColor} flex items-center justify-center text-base shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-app p-2">
      <p className="text-[9px] text-muted mb-0.5">{label}</p>
      <p className="text-[11px] font-semibold text-fg tabular truncate">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = "text-fg",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-2 border border-app p-3">
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold tabular ${accent} truncate`}>{value}</p>
    </div>
  );
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: "rial" | "usd";
  onChange: (u: "rial" | "usd") => void;
}) {
  const options = [
    { id: "usd" as const, label: "USD", aria: "نمایش به دلار" },
    { id: "rial" as const, label: "ریال", aria: "نمایش به ریال" },
  ];
  return (
    <div
      role="tablist"
      aria-label="واحد پول"
      className="flex p-0.5 rounded-xl bg-surface-2 border border-app"
    >
      {options.map((o) => {
        const active = unit === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.aria}
            onClick={() => onChange(o.id)}
            className={`
              px-2.5 py-1 rounded-lg text-[10px] font-semibold transition
              ${active
                ? "bg-surface text-fg shadow-sm"
                : "text-muted hover:text-fg"}
            `}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SalesRowUsd({
  entry,
  prev,
  unit,
}: {
  entry: MonthlySalesEntry;
  prev?: MonthlySalesEntry;
  unit: "rial" | "usd";
}) {
  const val = unit === "usd" ? entry.totalUsd : entry.totalRial;
  const prevVal = unit === "usd" ? prev?.totalUsd : prev?.totalRial;
  const momChange =
    val != null && prevVal != null && prevVal !== 0
      ? ((val - prevVal) / prevVal) * 100
      : null;

  const ytdChange =
    entry.ytdTotalRial != null &&
      entry.ytdPriorYearRial != null &&
      entry.ytdPriorYearRial > 0
      ? ((entry.ytdTotalRial - entry.ytdPriorYearRial) / entry.ytdPriorYearRial) * 100
      : null;

  const fxTone =
    entry.fxQualityStatus === "valid"
      ? "text-brand-600 dark:text-brand-400"
      : entry.fxQualityStatus === "suspicious"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-500 dark:text-slate-400";

  const fxGlyph =
    entry.fxQualityStatus === "valid"
      ? "✓"
      : entry.fxQualityStatus === "suspicious"
        ? "⚠"
        : "↩";

  const fxLabel =
    entry.fxQualityStatus === "valid"
      ? "نرخ معتبر"
      : entry.fxQualityStatus === "suspicious"
        ? "نرخ مشکوک"
        : "نرخ جایگزین";

  const fmtUsd = (n: number | null | undefined) =>
    n == null ? "—" : `$${(n / 1e6).toFixed(2)}M`;

  const fmtVal = (v: number | null | undefined) =>
    v == null ? "—" : unit === "usd" ? fmtUsd(v) : faNum(v);

  const momTone =
    momChange == null
      ? "text-muted"
      : momChange >= 0
        ? "text-brand-600 dark:text-brand-400"
        : "text-red-600 dark:text-red-400";

  const yearShort = String(entry.jy).slice(2);

  return (
    <article
      className="
        group rounded-2xl border border-app bg-surface-2/60
        hover:bg-surface-2 hover:border-brand-200 dark:hover:border-brand-500/30
        transition-colors p-3.5 sm:p-4
      "
    >
      {/* Top row: month + total + MoM */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="
              w-10 h-10 shrink-0 rounded-xl border border-app bg-surface
              flex flex-col items-center justify-center leading-none
            "
            aria-hidden="true"
          >
            <span className="text-[9px] text-muted tabular">
              {faNum(entry.jm)}
            </span>
            <span className="text-[10px] font-semibold text-fg tabular">
              {faNum(yearShort)}
            </span>
          </span>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg truncate">
              {new Date(entry.monthEnd).toLocaleDateString("fa-IR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={fxTone} title={fxLabel} aria-label={fxLabel}>
                {fxGlyph}
              </span>
              {entry.fxRateToman != null && (
                <span className="tabular">
                  {faNum(entry.fxRateToman)} تومان
                </span>
              )}
              {entry.reportUrl && (
                <>
                  <span className="opacity-40">·</span>
                  <a
                    href={entry.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 dark:text-brand-400 hover:underline decoration-dotted"
                  >
                    کدال ↗
                  </a>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="text-left shrink-0">
          <p className="text-[10px] text-muted">
            فروش ماه ({unit === "usd" ? "USD" : "ریال"})
          </p>
          <p className="text-base sm:text-lg font-bold text-fg tabular">
            {fmtVal(val)}
          </p>
          {momChange !== null && (
            <p className={`text-[10px] font-semibold tabular ${momTone}`}>
              {momChange >= 0 ? "▲" : "▼"} {Math.abs(momChange).toFixed(1)}٪
              <span className="text-muted font-normal"> ماهانه</span>
            </p>
          )}
        </div>
      </header>

      {/* Bottom row: breakdown */}
      <div
        className="
          mt-3 pt-3 border-t border-app/60
          grid grid-cols-3 gap-2 text-[11px]
        "
      >
        <BreakdownCell
          label="داخلی"
          value={fmtVal(entry.domesticRial != null && unit === "usd" ? entry.domesticUsd : entry.domesticRial)}
        />
        <BreakdownCell
          label="صادرات"
          value={fmtVal(entry.exportRial != null && unit === "usd" ? entry.exportUsd : entry.exportRial)}
        />
        <BreakdownCell
          label="خدمات"
          value={
            entry.serviceRial != null
              ? fmtVal(unit === "usd" ? entry.serviceUsd : entry.serviceRial)
              : "—"
          }
        />
      </div>

      {/* YTD strip */}
      {entry.ytdTotalRial != null && (
        <div className="mt-3 pt-3 border-t border-app/60 flex items-center justify-between gap-2 flex-wrap text-[10px]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted">
              YTD: <span className="text-fg font-semibold tabular">{faNum(entry.ytdTotalRial)}</span> م.ر
            </span>
            {entry.ytdPriorYearRial != null && (
              <span className="text-muted">
                سال قبل: <span className="text-fg font-semibold tabular">{faNum(entry.ytdPriorYearRial)}</span> م.ر
              </span>
            )}
          </div>
          {ytdChange != null && (
            <span className={`font-semibold tabular ${ytdChange >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"}`}>
              {ytdChange >= 0 ? "▲" : "▼"} {Math.abs(ytdChange).toFixed(1)}٪ YTD
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function BreakdownCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-muted mb-0.5">{label}</p>
      <p className="font-semibold text-fg tabular truncate">{value}</p>
    </div>
  );
}

function faShares(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیارد`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیون`;
  return n.toLocaleString("fa-IR");
}
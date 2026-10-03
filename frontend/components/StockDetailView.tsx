"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  StockDetail,
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

// ──────────────────────────────────────────────────────────
// Formatters
// ──────────────────────────────────────────────────────────

const faInt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faOne = new Intl.NumberFormat("fa-IR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function faNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(num);
}

function faPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const factor = 10 ** digits;
  const rounded = Math.round(n * factor) / factor;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded).toFixed(digits);
  const persian = abs.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
  return `${sign}${persian}٪`;
}

function faShares(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${faOne.format(n / 1e9)} میلیارد`;
  if (n >= 1e6) return `${faOne.format(n / 1e6)} میلیون`;
  return faInt.format(n);
}

// ──────────────────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: "market_cap", label: "ارزش بازار" },
  { id: "monthly", label: "گزارش فعالیت ماهانه" },
  { id: "financials", label: "صورتهای مالی" },
  { id: "money_flow", label: "روند قیمت" },
  { id: "dividends", label: "سودآوری" },
  { id: "ratios", label: "نسبتهای ارزشگذاری" },
  { id: "orderbook", label: "تابلو خوانی" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ──────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────

export default function StockDetailView({ stock }: { stock: StockDetail }) {
  const [activeTab, setActiveTab] = useState<TabId>("market_cap");
  const [watched, toggleWatched] = useWatchlist(stock.symbol);
  const [mcapUsd, setMcapUsd] = useState<number | null>(null);
  const [sales, setSales] = useState<MonthlySalesResponse | null>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const [unit, setUnit] = useState<"rial" | "usd">("usd");
  const reqId = useRef(0);

  const marketCap =
    stock.price.last && stock.sharesOutstanding
      ? (stock.price.last * Number(stock.sharesOutstanding)) / 1e9
      : null;

  const mcapLabel = mcapUsd
    ? `$${(mcapUsd / 1e6).toFixed(0)}M`
    : marketCap !== null
      ? `${faInt.format(marketCap)} همت`
      : "—";

  const fpe = stock.forwardPe;
  const fpeSources = fpe?.sources ?? {};
  const fpeConfidence = fpe?.confidence ?? "non_calculable";
  const fpeConfidenceScore = fpe?.confidenceScore ?? 0;

  const peRecent = fpe?.forwardPe ?? null;
  const pe12 = fpeSources.pe12 ?? null;
  const peDivergence =
    peRecent != null && pe12 != null && pe12 > 0
      ? ((peRecent - pe12) / pe12) * 100
      : null;

  const peMethodFa = (() => {
    const m = fpe?.method;
    if (!m) return null;
    if (m === "last3m_annualised") return "سالانه سازی ۳ ماه";
    if (m === "last3m_avg_annualised") return "میانگین ۳ ماه × ۴";
    if (m === "last3m_annualised_assumed_margin") return "۳ ماه (حاشیه فرضی)";
    if (m === "unavailable") return "بدون داده فصلی";
    return m;
  })();

  const peSub =
    peRecent != null
      ? pe12 != null
        ? `مبنای ۳ ماه × ۴${peDivergence != null ? ` · ${peDivergence >= 0 ? "+" : ""}${peDivergence.toFixed(0)}٪ نسبت به ۱۲ماهه` : ""}`
        : peMethodFa
          ? `مبنای ${peMethodFa}`
          : undefined
      : peMethodFa
        ? `P/E: ${peMethodFa}`
        : "بدون داده صورتهای مالی";

  // Single effect, both requests, race-safe.
  useEffect(() => {
    const id = ++reqId.current;
    setLoadingSales(true);

    Promise.allSettled([
      fetchMcapSummary(stock.symbol),
      fetchMonthlySales(stock.symbol, 36),
    ])
      .then(([mcapRes, salesRes]) => {
        if (id !== reqId.current) return;
        if (mcapRes.status === "fulfilled" && mcapRes.value) {
          setMcapUsd(mcapRes.value.mcapUsd);
        }
        setSales(salesRes.status === "fulfilled" ? salesRes.value : null);
      })
      .finally(() => {
        if (id === reqId.current) setLoadingSales(false);
      });
  }, [stock.symbol]);

  const months = sales?.months ?? [];
  const latest = months[months.length - 1];
  const latestYtd = latest?.ytdTotalRial ?? null;
  const latestPriorYtd = latest?.ytdPriorYearRial ?? null;
  const ytdGrowth =
    latestYtd != null && latestPriorYtd != null && latestPriorYtd > 0
      ? ((latestYtd - latestPriorYtd) / latestPriorYtd) * 100
      : null;

  const peTone =
    peRecent == null
      ? "neutral"
      : peDivergence != null && Math.abs(peDivergence) > 25
        ? "warn"
        : "accent";

  return (
    <main className="flex-1 bg-app">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Breadcrumb */}
        <nav
          aria-label="مسیر"
          className="flex flex-wrap items-center gap-2 text-[11px] text-muted"
        >
          <Link href="/" className="hover:text-fg">خانه</Link>
          <span className="opacity-50">›</span>
          <Link
            href={`/stocks?sector=${encodeURIComponent(stock.sector)}`}
            className="hover:text-fg"
          >
            {stock.sector}
          </Link>
          <span className="opacity-50">›</span>
          <span className="font-semibold text-fg">{stock.symbol}</span>
        </nav>

        {/* ── Header card ─────────────────────────────── */}
        <section className="rounded-3xl border border-app bg-surface p-5">
          {/* Row 1: identity + actions */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M3 17l6-6 4 4 8-8" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-fg sm:text-xl">
                  {stock.name}
                </h1>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                  <span className="font-mono font-semibold text-fg">
                    {stock.symbol}
                  </span>
                  <PriceFreshnessBadge stale={stock.price.isStale} />
                </div>
              </div>
            </div>

            <button
              type="button"
              aria-pressed={watched}
              onClick={toggleWatched}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition ${watched
                  ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-400"
                  : "border-app bg-surface text-muted hover:border-brand-300 hover:text-fg dark:hover:border-brand-500/40"
                }`}
            >
              {watched ? "★ در واچلیست" : "☆ افزودن به واچلیست"}
            </button>
          </div>

          {/* Row 2: metadata */}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-app pt-4 text-[11px] sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">ISIN</dt>
              <dd className="truncate font-mono tabular-nums text-fg">
                {stock.isin ?? "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">سرمایه</dt>
              <dd className="font-medium tabular-nums text-fg">
                {faShares(Number(stock.sharesOutstanding))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted">صنعت</dt>
              <dd className="truncate font-medium text-fg">{stock.sector}</dd>
            </div>
          </dl>
        </section>

        {/* ── Metric cards ────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="ارزش بازار"
            value={mcapLabel}
            sub={mcapUsd ? "بر مبنای نرخ ارز روز" : undefined}
          />
          <MetricCard
            label="P/E آیندهنگر"
            value={peRecent?.toFixed(2) ?? "—"}
            sub={peSub}
            tone={peTone}
            featured
          />
          <MetricCard
            label="حاشیه سود فصلی"
            value={
              fpeSources.quarterlyMargin != null
                ? `${faOne.format(fpeSources.quarterlyMargin * 100)}٪`
                : "—"
            }
            sub={fpeSources.marginSource ?? undefined}
          />
          <MetricCard
            label="رشد فروش YTD"
            value={ytdGrowth != null ? faPercent(ytdGrowth) : "—"}
            sub={latestYtd != null ? `YTD: ${faInt.format(latestYtd)} م.ر` : undefined}
            tone={
              ytdGrowth == null
                ? "neutral"
                : ytdGrowth > 0
                  ? "up"
                  : ytdGrowth < 0
                    ? "down"
                    : "neutral"
            }
          />
        </section>

        {/* ── Forward P/E detail ─────────────────────── */}
        {fpe && (
          <section className="rounded-3xl border border-app bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-fg">برآورد P/E آیندهنگر</h2>
              <ConfidenceBadge
                confidence={fpeConfidence}
                score={fpeConfidenceScore}
              />
            </div>

            {fpeConfidence === "non_calculable" ? (
              <p className="text-[11px] leading-6 text-muted">
                {fpe.disclaimer ??
                  "صورت مالی فصلی برای این نماد در دسترس نیست — P/E آیندهنگر محاسبه نشد."}
              </p>
            ) : (
              <>
                {/* Headline comparison */}
                {pe12 != null && (
                  <div
                    className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] ${Math.abs(peDivergence ?? 0) > 25
                        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                        : "border-app bg-surface-2 text-muted"
                      }`}
                  >
                    <span>
                      مبنای ۳ ماه × ۴:{" "}
                      <strong className="tabular-nums text-fg">
                        {peRecent!.toFixed(2)}
                      </strong>{" "}
                      · مبنای ۱۲ ماه:{" "}
                      <span className="tabular-nums">{pe12.toFixed(2)}</span>
                    </span>
                    {peDivergence != null && (
                      <span
                        className={`font-semibold tabular-nums ${peDivergence < 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                          }`}
                      >
                        {peDivergence >= 0 ? "+" : ""}
                        {peDivergence.toFixed(0)}٪
                      </span>
                    )}
                  </div>
                )}

                {/* Key inputs */}
                <dl className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
                  <Pill
                    label="EPS برآوردی"
                    value={`${faInt.format(fpe.estimatedAnnualEps ?? 0)} ریال`}
                  />
                  <Pill
                    label="فروش فصلی"
                    value={`${faInt.format(fpeSources.quarterlySales ?? 0)} م.ر`}
                  />
                  <Pill
                    label="روش"
                    value={peMethodFa ?? "—"}
                  />
                </dl>

                {peDivergence != null && Math.abs(peDivergence) > 25 && (
                  <p className="mt-3 text-[10px] leading-6 text-amber-700 dark:text-amber-400">
                    ⚠️ فاصله دو مبنا معنادار است — عدد ارزانتر بر فرض تداوم فروش
                    ماههای اخیر استوار است.
                  </p>
                )}

                {fpe.disclaimer && (
                  <details className="mt-3 text-[10px] text-muted">
                    <summary className="cursor-pointer select-none font-medium hover:text-fg">
                      جزئیات محاسبه
                    </summary>
                    <p className="mt-2 leading-6">{fpe.disclaimer}</p>
                  </details>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Fundamental summary ─────────────────────── */}
        <section className="rounded-3xl border border-brand-100 bg-brand-50/40 p-5 dark:border-brand-500/15 dark:bg-brand-500/5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="mb-2 text-sm font-bold text-brand-700 dark:text-brand-400">
                خلاصه بنیادی {stock.symbol}
              </h2>
              <p className="text-xs leading-7 text-muted sm:text-[13px]">
                {stock.name} در گروه{" "}
                <strong className="text-fg">{stock.sector}</strong> بورس تهران
                فعالیت میکند؛ ارزش بازار آن{" "}
                <strong className="text-fg">{mcapLabel}</strong>{" "}
                {peRecent != null && (
                  <>
                    و P/E آیندهنگر آن{" "}
                    <strong className="text-fg">{peRecent.toFixed(2)}</strong>{" "}
                  </>
                )}
                {pe12 != null && (
                  <>(بر مبنای ۱۲ ماه اخیر {pe12.toFixed(2)}) </>
                )}
                {ytdGrowth != null && (
                  <>
                    با رشد فروش YTD{" "}
                    <strong
                      className={
                        ytdGrowth >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    >
                      {faPercent(ytdGrowth)}
                    </strong>{" "}
                    نسبت به مدت مشابه سال قبل است.
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* ── Tabs ────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <aside className="rounded-3xl border border-app bg-surface p-3 lg:col-span-1 lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
              بخشها
            </p>
            <nav role="tablist" className="space-y-0.5">
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
                      const idx = TABS.findIndex((t) => t.id === tab.id);
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveTab(TABS[(idx + 1) % TABS.length]!.id);
                      } else if (
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowUp"
                      ) {
                        e.preventDefault();
                        setActiveTab(
                          TABS[(idx - 1 + TABS.length) % TABS.length]!.id,
                        );
                      }
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-right text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${active
                        ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                  >
                    <span>{tab.label}</span>
                    {active && (
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
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
            className="space-y-4 lg:col-span-3"
          >
            {activeTab === "market_cap" && <MarketCapTab symbol={stock.symbol} />}
            {activeTab === "monthly" && <MonthlyChartTab symbol={stock.symbol} />}
            {activeTab === "financials" && <FinancialsTab stock={stock} />}
            {activeTab === "money_flow" && <MoneyFlowTab symbol={stock.symbol} />}
            {activeTab === "dividends" && <DividendsTab symbol={stock.symbol} />}
            {activeTab === "ratios" && <RatiosTab stock={stock} />}
            {activeTab === "orderbook" && (
              <div className="rounded-3xl border border-app bg-surface p-12 text-center">
                <p className="text-sm font-bold text-fg">تابلو خوانی</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted">
                  داده تابلوی خوانی نیازمند اتصال به API سفارشات TSETMC است. در
                  حال تکمیل.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Price snapshot ──────────────────────────── */}
        <section className="rounded-3xl border border-app bg-surface p-5">
          <h2 className="mb-4 text-sm font-bold text-fg">تصویر لحظهای قیمت</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="آخرین قیمت" value={faPrice(stock.price.last)} strong />
            <MiniStat
              label="بالاترین"
              value={stock.price.high ? faPrice(stock.price.high) : "—"}
            />
            <MiniStat
              label="پایینترین"
              value={stock.price.low ? faPrice(stock.price.low) : "—"}
            />
            <MiniStat label="حجم" value={faNum(stock.price.volume)} />
            <MiniStat label="ارزش معاملات" value={faNum(stock.price.value)} />
            <MiniStat
              label="سهام منتشرشده"
              value={faShares(Number(stock.sharesOutstanding))}
            />
            <MiniStat label="ISIN" value={stock.isin ?? "—"} />
            <MiniStat
              label="آخرین بهروزرسانی"
              value={
                stock.price.timestamp
                  ? new Date(stock.price.timestamp).toLocaleString("fa-IR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                  : "—"
              }
            />
          </dl>
        </section>

        {/* ── Monthly sales ───────────────────────────── */}
        <section className="rounded-3xl border border-app bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-app px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-fg">تاریخچه فروش ماهانه</h2>
              {sales && (
                <p className="mt-0.5 text-[10px] text-muted">
                  {faInt.format(sales.meta.count)} گزارش از کدال
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {sales?.ytdTotalRial != null && (
                <span className="rounded-lg border border-app bg-surface-2 px-2.5 py-1 text-[10px] tabular-nums text-muted">
                  YTD:{" "}
                  {unit === "usd" && sales.ytdTotalUsd
                    ? `$${(sales.ytdTotalUsd / 1e6).toFixed(1)}M`
                    : `${faInt.format(sales.ytdTotalRial)} م.ر`}
                </span>
              )}
              {sales && <UnitToggle unit={unit} onChange={setUnit} />}
            </div>
          </header>

          <div className="p-5">
            {loadingSales ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-2xl bg-surface-2"
                  />
                ))}
              </div>
            ) : months.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs text-muted">گزارش فروش ماهانه موجود نیست</p>
              </div>
            ) : (
              <>
                {/* Desktop: table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium">ماه</th>
                        <th className="px-3 py-2 text-left font-medium">
                          فروش ماه
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          ماهانه
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          داخلی
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          صادرات
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          خدمات
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          YTD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...months].reverse().map((m, idx, arr) => (
                        <SalesTableRow
                          key={m.monthEnd}
                          entry={m}
                          prev={arr[idx + 1]}
                          unit={unit}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: cards */}
                <div className="space-y-3 md:hidden">
                  {[...months].reverse().map((m, idx, arr) => (
                    <SalesCard
                      key={m.monthEnd}
                      entry={m}
                      prev={arr[idx + 1]}
                      unit={unit}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────

type Tone = "neutral" | "up" | "down" | "accent" | "warn";

function toneClass(tone: Tone): string {
  switch (tone) {
    case "up":
      return "text-emerald-600 dark:text-emerald-400";
    case "down":
      return "text-red-600 dark:text-red-400";
    case "accent":
      return "text-brand-600 dark:text-brand-400";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-fg";
  }
}

function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
  featured = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-surface p-4 ${featured
          ? "border-brand-200 dark:border-brand-500/30"
          : "border-app"
        }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 font-bold tabular-nums ${featured ? "text-2xl" : "text-xl"} ${toneClass(tone)}`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 truncate text-[10px] text-muted" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({
  confidence,
  score,
}: {
  confidence: string;
  score: number;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    high: {
      label: "اطمینان بالا",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    },
    medium: {
      label: "اطمینان متوسط",
      cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    },
    low: {
      label: "اطمینان پایین",
      cls: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    },
    non_calculable: {
      label: "غیرقابل محاسبه",
      cls: "bg-surface-2 text-muted",
    },
  };
  const m = map[confidence] ?? map.low!;
  const showScore = confidence !== "non_calculable";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${m.cls}`}
    >
      {m.label}
      {showScore && ` · ${faInt.format(score * 100)}٪`}
    </span>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-app bg-surface-2 p-2.5">
      <p className="text-[9px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-app bg-surface-2 p-3">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd
        className={`mt-0.5 truncate tabular-nums ${strong ? "text-sm font-bold text-fg" : "text-sm font-semibold text-fg"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PriceFreshnessBadge({ stale }: { stale: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${stale
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        }`}
    >
      {stale ? "قیمت قدیمی" : "قیمت بهروز"}
    </span>
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
    { id: "usd" as const, label: "USD" },
    { id: "rial" as const, label: "ریال" },
  ];
  return (
    <div
      role="tablist"
      aria-label="واحد پول"
      className="flex rounded-lg border border-app bg-surface-2 p-0.5"
    >
      {options.map((o) => {
        const active = unit === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${active
                ? "bg-surface text-fg shadow-sm"
                : "text-muted hover:text-fg"
              }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sales rows
// ──────────────────────────────────────────────────────────

function useSalesDerived(
  entry: MonthlySalesEntry,
  prev: MonthlySalesEntry | undefined,
  unit: "rial" | "usd",
) {
  const pick = (
    rial: number | null | undefined,
    usd: number | null | undefined,
  ) => (unit === "usd" ? (usd ?? null) : (rial ?? null));

  const value = pick(entry.totalRial, entry.totalUsd);
  const prevValue = pick(prev?.totalRial, prev?.totalUsd);
  const mom =
    value != null && prevValue != null && prevValue !== 0
      ? ((value - prevValue) / prevValue) * 100
      : null;

  const ytdChange =
    entry.ytdTotalRial != null &&
      entry.ytdPriorYearRial != null &&
      entry.ytdPriorYearRial > 0
      ? ((entry.ytdTotalRial - entry.ytdPriorYearRial) /
        entry.ytdPriorYearRial) *
      100
      : null;

  const fmt = (v: number | null | undefined) => {
    if (v == null) return "—";
    if (unit === "usd") return `$${(v / 1e6).toFixed(2)}M`;
    return faInt.format(v);
  };

  return { value, mom, ytdChange, fmt, pick };
}

function FxDot({ status }: { status?: MonthlySalesEntry["fxQualityStatus"] }) {
  const map: Record<string, { cls: string; label: string }> = {
    valid: { cls: "bg-emerald-500", label: "نرخ ارز معتبر" },
    suspicious: { cls: "bg-amber-500", label: "نرخ ارز مشکوک" },
  };
  const m = map[status ?? ""] ?? { cls: "bg-slate-400", label: "نرخ جایگزین" };
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${m.cls}`}
      title={m.label}
      aria-label={m.label}
    />
  );
}

function SalesTableRow({
  entry,
  prev,
  unit,
}: {
  entry: MonthlySalesEntry;
  prev?: MonthlySalesEntry;
  unit: "rial" | "usd";
}) {
  const { value, mom, ytdChange, fmt, pick } = useSalesDerived(entry, prev, unit);
  const momTone = toneClass(
    mom == null ? "neutral" : mom > 0 ? "up" : mom < 0 ? "down" : "neutral",
  );
  const ytdTone = toneClass(
    ytdChange == null
      ? "neutral"
      : ytdChange > 0
        ? "up"
        : ytdChange < 0
          ? "down"
          : "neutral",
  );

  return (
    <tr className="border-b border-app/60 last:border-0 hover:bg-surface-2/60">
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center gap-2">
          <FxDot status={entry.fxQualityStatus} />
          <span className="font-medium text-fg">
            {new Date(entry.monthEnd).toLocaleDateString("fa-IR", {
              year: "2-digit",
              month: "short",
            })}
          </span>
          {entry.reportUrl && (
            <a
              href={entry.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted hover:text-brand-600 dark:hover:text-brand-400"
              aria-label="مشاهده در کدال"
            >
              ↗
            </a>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-left font-mono tabular-nums text-fg">
        {fmt(value)}
      </td>
      <td
        className={`px-3 py-2.5 text-left font-mono tabular-nums font-semibold ${momTone}`}
      >
        {mom == null ? "—" : `${mom >= 0 ? "+" : ""}${mom.toFixed(1)}٪`}
      </td>
      <td className="px-3 py-2.5 text-left font-mono tabular-nums text-muted">
        {fmt(pick(entry.domesticRial, entry.domesticUsd))}
      </td>
      <td className="px-3 py-2.5 text-left font-mono tabular-nums text-muted">
        {fmt(pick(entry.exportRial, entry.exportUsd))}
      </td>
      <td className="px-3 py-2.5 text-left font-mono tabular-nums text-muted">
        {fmt(pick(entry.serviceRial, entry.serviceUsd))}
      </td>
      <td
        className={`px-3 py-2.5 text-left font-mono tabular-nums font-semibold ${ytdTone}`}
      >
        {ytdChange == null
          ? "—"
          : `${ytdChange >= 0 ? "+" : ""}${ytdChange.toFixed(1)}٪`}
      </td>
    </tr>
  );
}

function SalesCard({
  entry,
  prev,
  unit,
}: {
  entry: MonthlySalesEntry;
  prev?: MonthlySalesEntry;
  unit: "rial" | "usd";
}) {
  const { value, mom, ytdChange, fmt, pick } = useSalesDerived(entry, prev, unit);
  const momTone = toneClass(
    mom == null ? "neutral" : mom > 0 ? "up" : mom < 0 ? "down" : "neutral",
  );
  const ytdTone = toneClass(
    ytdChange == null
      ? "neutral"
      : ytdChange > 0
        ? "up"
        : ytdChange < 0
          ? "down"
          : "neutral",
  );

  return (
    <article className="rounded-2xl border border-app bg-surface-2/50 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FxDot status={entry.fxQualityStatus} />
            <p className="text-sm font-semibold text-fg">
              {new Date(entry.monthEnd).toLocaleDateString("fa-IR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
            {entry.fxRateToman != null && (
              <span className="tabular-nums">
                {faInt.format(entry.fxRateToman)} تومان
              </span>
            )}
            {entry.reportUrl && (
              <>
                <span className="opacity-40">·</span>
                <a
                  href={entry.reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline dark:text-brand-400"
                >
                  کدال ↗
                </a>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-left">
          <p className="text-[10px] text-muted">فروش ماه</p>
          <p className="text-lg font-bold tabular-nums text-fg">
            {fmt(value)}
          </p>
          {mom != null && (
            <p className={`text-[10px] font-semibold tabular-nums ${momTone}`}>
              {mom >= 0 ? "▲" : "▼"} {Math.abs(mom).toFixed(1)}٪
            </p>
          )}
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-app/60 pt-3 text-[11px]">
        <div>
          <dt className="text-[9px] text-muted">داخلی</dt>
          <dd className="truncate font-semibold tabular-nums text-fg">
            {fmt(pick(entry.domesticRial, entry.domesticUsd))}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] text-muted">صادرات</dt>
          <dd className="truncate font-semibold tabular-nums text-fg">
            {fmt(pick(entry.exportRial, entry.exportUsd))}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] text-muted">خدمات</dt>
          <dd className="truncate font-semibold tabular-nums text-fg">
            {entry.serviceRial != null || entry.serviceUsd != null
              ? fmt(pick(entry.serviceRial, entry.serviceUsd))
              : "—"}
          </dd>
        </div>
      </dl>

      {entry.ytdTotalRial != null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-app/60 pt-3 text-[10px]">
          <span className="text-muted">
            YTD:{" "}
            <strong className="tabular-nums text-fg">
              {faInt.format(entry.ytdTotalRial)}
            </strong>{" "}
            م.ر
          </span>
          {ytdChange != null && (
            <span className={`font-semibold tabular-nums ${ytdTone}`}>
              {ytdChange >= 0 ? "▲" : "▼"} {Math.abs(ytdChange).toFixed(1)}٪
            </span>
          )}
        </div>
      )}
    </article>
  );
}
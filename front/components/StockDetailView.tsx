"use client";

import Link from "next/link";
import { StockDetail, SalesReport } from "@/lib/api";
import { faPrice } from "@/lib/format";

const confidenceBadge = {
    high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    low: "bg-red-500/10 text-red-400 border-red-500/20",
} as const;

const confidenceFa = { high: "بالا", medium: "متوسط", low: "کم" } as const;

const jalaliDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });

export default function StockDetailView({ stock }: { stock: StockDetail }) {
    const { price, forwardPe, salesHistory } = stock;

    // Aggregate stats across all reports
    const latestYtd = salesHistory[0]?.ytdSalesTotal ?? 0;
    const latestPriorYtd = salesHistory[0]?.priorYtdSalesTotal ?? 0;
    const yoyGrowth = latestPriorYtd ? ((latestYtd - latestPriorYtd) / latestPriorYtd) * 100 : null;

    const totalVolume = salesHistory.reduce((sum, r) => sum + (r.detail.goods.reduce((s, g) => s + (g.qtyYtd ?? 0), 0) / salesHistory.length || 0), 0);

    return (
        <main dir="rtl" className="min-h-screen pb-16">
            {/* Header */}
            <header className="border-b border-zinc-900 bg-zinc-950/60 backdrop-blur sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link
                        href="/"
                        className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center
                       hover:bg-zinc-800 hover:border-zinc-700 transition text-zinc-400 hover:text-zinc-200"
                        aria-label="بازگشت"
                    >
                        ←
                    </Link>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-lg font-bold leading-tight truncate">{stock.name}</h1>
                        <p className="text-[11px] text-zinc-500 flex items-center gap-2">
                            <span>{stock.symbol}</span>
                            <span className="opacity-40">•</span>
                            <span>{stock.sector}</span>
                            {stock.isin && (
                                <>
                                    <span className="opacity-40">•</span>
                                    <span className="tabular">{stock.isin}</span>
                                </>
                            )}
                        </p>
                    </div>
                    {price.isStale && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            قیمت قدیمی
                        </span>
                    )}
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-6 pt-6 space-y-6">

                {/* Hero stats */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <BigStat
                        label="آخرین قیمت"
                        value={faPrice(price.last)}
                        unit="ریال"
                        sub={jalaliDate(price.timestamp)}
                    />
                    <BigStat
                        label="P/E آینده"
                        value={forwardPe.forwardPe?.toFixed(2) ?? "—"}
                        accent={forwardPe.forwardPe < 5 ? "text-emerald-400" : forwardPe.forwardPe < 10 ? "text-teal-400" : "text-zinc-200"}
                        sub={`EPS: ${faPrice(forwardPe.estimatedAnnualEps)}`}
                    />
                    <BigStat
                        label="رشد فروش سالانه (YTD)"
                        value={yoyGrowth !== null ? `${yoyGrowth >= 0 ? "+" : ""}${yoyGrowth.toFixed(1)}٪` : "—"}
                        accent={yoyGrowth !== null && yoyGrowth >= 0 ? "text-emerald-400" : "text-red-400"}
                        sub={`${faPrice(latestYtd)} در برابر ${faPrice(latestPriorYtd)}`}
                    />
                </section>

                {/* Confidence banner */}
                <section className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] px-2 py-1 rounded-full border ${confidenceBadge[forwardPe.confidence]}`}>
                                    اطمینان {confidenceFa[forwardPe.confidence]}
                                </span>
                                <span className="text-[10px] text-zinc-500 tabular">
                                    {forwardPe.confidenceScore.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-zinc-600">روش: {forwardPe.method}</span>
                            </div>
                            {forwardPe.disclaimer && (
                                <p className="text-[11px] text-zinc-500 leading-relaxed">{forwardPe.disclaimer}</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Price snapshot */}
                <Section title="تصویر لحظه‌ای قیمت">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MiniStat label="باز" value={price.open ? faPrice(price.open) : "—"} />
                        <MiniStat label="بالاترین" value={price.high ? faPrice(price.high) : "—"} />
                        <MiniStat label="پایین‌ترین" value={price.low ? faPrice(price.low) : "—"} />
                        <MiniStat label="حجم" value={price.volume.toLocaleString("fa-IR")} />
                        <MiniStat label="ارزش معاملات" value={price.value.toLocaleString("fa-IR")} />
                        <MiniStat label="سهام منتشرشده" value={Number(stock.sharesOutstanding).toLocaleString("fa-IR")} />
                        <MiniStat label="آخرین به‌روزرسانی" value={jalaliDate(price.timestamp)} />
                        <MiniStat label="وضعیت" value={price.isStale ? "قدیمی" : "به‌روز"} accent={price.isStale ? "text-yellow-400" : "text-emerald-400"} />
                    </div>
                </Section>

                {/* Sales history */}
                <Section title={`تاریخچه فروش ماهانه (${salesHistory.length} گزارش)`}>
                    <div className="space-y-3">
                        {salesHistory.map((r, i) => (
                            <SalesRow key={r.monthEnd} report={r} prev={salesHistory[i + 1]} index={i} />
                        ))}
                    </div>
                </Section>

                {/* Full detail table for latest month */}
                {salesHistory[0]?.detail && (
                    <Section title={`جزئیات گزارش ${salesHistory[0].detail.periodEnd}`}>
                        <div className="overflow-x-auto -mx-5 px-5">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-zinc-500 border-b border-zinc-800">
                                        <th className="text-right py-2 font-medium">شرح</th>
                                        <th className="text-left py-2 font-medium tabular">مقدار دوره</th>
                                        <th className="text-left py-2 font-medium tabular">ارزش دوره</th>
                                        <th className="text-left py-2 font-medium tabular">مقدار YTD</th>
                                        <th className="text-left py-2 font-medium tabular">ارزش YTD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...salesHistory[0].detail.goods, ...salesHistory[0].detail.totals].map((row, i) => {
                                        const isTotal = row.rowTypeName === "FixedRow";
                                        return (
                                            <tr
                                                key={i}
                                                className={`border-b border-zinc-900 ${isTotal ? "font-semibold text-zinc-200" : "text-zinc-400"}`}
                                            >
                                                <td className="py-2 text-right">{row.label || "—"}</td>
                                                <td className="py-2 text-left tabular">{row.qtyPeriod?.toLocaleString("fa-IR") ?? "—"}</td>
                                                <td className="py-2 text-left tabular">{row.valuePeriod ? row.valuePeriod.toLocaleString("fa-IR") : "—"}</td>
                                                <td className="py-2 text-left tabular">{row.qtyYtd?.toLocaleString("fa-IR") ?? "—"}</td>
                                                <td className="py-2 text-left tabular">{row.valueYtd ? row.valueYtd.toLocaleString("fa-IR") : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                )}

            </div>
        </main>
    );
}

/* ---------- Subcomponents ---------- */

function SalesRow({ report, prev, index }: { report: SalesReport; prev?: SalesReport; index: number }) {
    const momChange =
        prev && prev.salesAmount
            ? ((report.salesAmount - prev.salesAmount) / prev.salesAmount) * 100
            : null;

    return (
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 p-4 hover:border-zinc-700 transition">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] tabular text-zinc-500">
                        {index + 1}
                    </span>
                    <div>
                        <p className="text-sm font-semibold">{jalaliDate(report.monthEnd)}</p>
                        <p className="text-[10px] text-zinc-500">{report.detail.periodEnd}</p>
                    </div>
                </div>

                <div className="flex items-center gap-5 text-xs tabular">
                    <div className="text-left">
                        <p className="text-[10px] text-zinc-500">فروش ماه</p>
                        <p className="font-semibold">{report.salesAmount.toLocaleString("fa-IR")}</p>
                    </div>
                    {momChange !== null && (
                        <div className="text-left">
                            <p className="text-[10px] text-zinc-500">تغییر ماهانه</p>
                            <p className={`font-semibold ${momChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {momChange >= 0 ? "+" : ""}{momChange.toFixed(1)}٪
                            </p>
                        </div>
                    )}
                    <div className="text-left">
                        <p className="text-[10px] text-zinc-500">صادرات</p>
                        <p className="font-semibold">{report.exportMonthly.toLocaleString("fa-IR")}</p>
                    </div>
                    {report.sourceUrl && (
                        <a
                            href={report.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-500 hover:text-emerald-400 underline decoration-dotted"
                        >
                            کدال ↗
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

function BigStat({ label, value, unit, sub, accent = "text-zinc-100" }: { label: string; value: string; unit?: string; sub?: string; accent?: string }) {
    return (
        <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5">
            <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
            <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold tabular ${accent}`}>{value}</span>
                {unit && <span className="text-[10px] text-zinc-500">{unit}</span>}
            </div>
            {sub && <p className="text-[10px] text-zinc-500 mt-1">{sub}</p>}
        </div>
    );
}

function MiniStat({ label, value, accent = "text-zinc-200" }: { label: string; value: string; accent?: string }) {
    return (
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-3">
            <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
            <p className={`text-sm font-semibold tabular ${accent}`}>{value}</p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">{title}</h2>
            {children}
        </section>
    );
}
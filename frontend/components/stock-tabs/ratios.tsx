"use client";

import { useEffect, useMemo, useState } from "react";
import { StockDetail, fetchQuarterlyHistory, QuarterlyPoint } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

function faNum(n: number | string | null | undefined, digits = 2): string {
    if (n === null || n === undefined || n === "") return "—";
    return Number(n).toLocaleString("fa-IR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

export function RatiosTab({ stock }: { stock: StockDetail }) {
    const [history, setHistory] = useState<QuarterlyPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetchQuarterlyHistory(stock.symbol)
            .then((res) => setHistory(res.points))
            .catch((e) => {
                setError(e instanceof Error ? e.message : "خطا در دریافت تاریخچه");
                setHistory([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, [stock.symbol]);

    const marketCap =
        stock.price.last && stock.sharesOutstanding
            ? (stock.price.last * Number(stock.sharesOutstanding)) / 1e9
            : null;

    // Estimate forward ratios from available data
    const forwardPe = stock.forwardPe.forwardPe ?? null;
    const eps = stock.forwardPe.estimatedAnnualEps ?? null;

    return (
        <div className="space-y-4">
            {/* Valuation ratios card */}
            <div className="rounded-2xl bg-surface border border-app p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                            💹
                        </span>
                        ارزش‌گذاری
                    </h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <RatioCard
                        label="P/A"
                        icon="📊"
                        value={marketCap !== null ? (marketCap / 1000).toFixed(2) : "—"}
                        hint="ارزش بازار / دارایی‌ها"
                    />
                    <RatioCard
                        label="P/S"
                        icon="📈"
                        value={estimatePS(stock)}
                        hint="ارزش بازار / فروش"
                    />
                    <RatioCard
                        label="P/E (گذشته‌نگر)"
                        icon="📅"
                        value="—"
                        hint="نیازمند EPS تاریخی"
                    />
                    <RatioCard
                        label="P/E (آینده‌نگر)"
                        icon="🔮"
                        value={forwardPe?.toFixed(2) ?? "—"}
                        accent="text-brand-600 dark:text-brand-400"
                        hint={`EPS: ${eps ? faNum(eps, 0) : "—"}`}
                    />
                    <RatioCard
                        label="P/B"
                        icon="📚"
                        value="—"
                        hint="نیازمند حقوق صاحبان سهام"
                    />
                    <RatioCard
                        label="سود خالص برآوردی"
                        icon="💰"
                        value={eps ? `${faNum(eps / 1000, 2)} همت` : "—"}
                        hint="EPS × تعداد سهام"
                    />
                </div>
            </div>

            {/* P/E history chart */}
            <div className="rounded-2xl bg-surface border border-app p-5">
                <h3 className="text-sm font-bold text-fg mb-1">روند P/E</h3>
                <p className="text-[10px] text-muted mb-4">
                    P/E آینده‌نگر در هر فصل
                </p>

                {loading ? (
                    <div className="h-72 rounded-xl skeleton" />
                ) : error ? (
                    <TabError retry={load} />
                ) : history.length === 0 ? (
                    <TabEmpty
                        title="داده تاریخی P/E موجود نیست"
                        body="هنوز صورت مالی کافی برای محاسبه P/E تاریخی این نماد ثبت نشده است."
                        icon="📊"
                    />
                ) : (
                    <PEHistoryChart points={history} current={forwardPe} />
                )}

                <p className="text-[10px] text-muted leading-6 mt-4 text-center">
                    مبانی محاسبات: ارزش بازار (تومان) ÷ سود (annualized) × ۱۰۰
                    <br />
                    آخرین P/E آینده‌نگر برآوردی: {forwardPe?.toFixed(2) ?? "—"}
                </p>
            </div>
        </div>
    );
}

function estimatePS(stock: StockDetail): string {
    // P/S = market cap / annual revenue.
    // Approximate annual revenue from the 3 most recent months (avg × 12).
    // NOTE: salesHistory is chronological ascending, so slice(-3) = latest.
    const latest3 = stock.salesHistory.slice(-3);
    if (latest3.length === 0) return "—";
    const avgMonthly =
        latest3.reduce((s, r) => s + r.salesAmount, 0) / latest3.length;
    const annualRevenue = avgMonthly * 12; // million IRR
    const marketCapIRR =
        stock.price.last && stock.sharesOutstanding
            ? stock.price.last * Number(stock.sharesOutstanding)
            : 0;
    if (!marketCapIRR || !annualRevenue) return "—";
    const marketCapMillions = marketCapIRR / 1e6;
    return (marketCapMillions / annualRevenue).toFixed(2);
}

function RatioCard({
    label,
    value,
    hint,
    icon,
    accent = "text-fg",
}: {
    label: string;
    value: string;
    hint?: string;
    icon?: string;
    accent?: string;
}) {
    return (
        <div className="rounded-xl bg-surface-2 border border-app p-3.5">
            <div className="flex items-center gap-2 mb-2">
                {icon && (
                    <span className="w-6 h-6 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px]">
                        {icon}
                    </span>
                )}
                <p className="text-[10px] text-muted">{label}</p>
            </div>
            <p className={`text-lg font-bold tabular ${accent}`}>{value}</p>
            {hint && <p className="text-[9px] text-muted/70 mt-1">{hint}</p>}
        </div>
    );
}

/* ---------- P/E bar chart ---------- */

function PEHistoryChart({
    points,
    current,
}: {
    points: QuarterlyPoint[];
    current: number | null;
}) {
    const width = 900;
    const height = 320;
    const padding = { top: 30, right: 40, bottom: 40, left: 40 };

    const { bars, yTicks, max } = useMemo(() => {
        const values = points.map((p) => p.pe).filter((v): v is number => v !== null);
        const max = Math.max(...values, current ?? 0, 1);
        const innerW = width - padding.left - padding.right;
        const innerH = height - padding.top - padding.bottom;

        const barWidth = innerW / points.length - 8;

        const y = (v: number) => padding.top + innerH - (v / max) * innerH;

        const bars = points.map((p, i) => ({
            x: padding.left + i * (innerW / points.length) + 4,
            y: p.pe !== null ? y(p.pe) : padding.top + innerH,
            h: p.pe !== null ? (p.pe / max) * innerH : 0,
            value: p.pe,
            label: p.label,
        }));

        const ticks = Array.from({ length: 5 }, (_, i) => {
            const v = (max * i) / 4;
            return { v, y: y(v) };
        });

        return { bars, yTicks: ticks, max };
    }, [points, current]);

    return (
        <div className="text-muted">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="روند P/E آینده‌نگر در هر فصل">
                <title>روند P/E آینده‌نگر در هر فصل</title>
                {yTicks.map((t, i) => (
                    <g key={i}>
                        <line
                            x1={padding.left}
                            x2={width - padding.right}
                            y1={t.y}
                            y2={t.y}
                            stroke="currentColor"
                            strokeOpacity="0.08"
                            strokeDasharray="3 4"
                        />
                        <text
                            x={padding.left - 6}
                            y={t.y + 4}
                            fontSize="10"
                            fill="currentColor"
                            fillOpacity="0.5"
                            textAnchor="end"
                        >
                            {t.v.toFixed(0)}
                        </text>
                    </g>
                ))}

                {bars.map((b, i) => {
                    const isLast = i === bars.length - 1;
                    return (
                        <g key={i}>
                            <rect
                                x={b.x}
                                y={b.y}
                                width={width / points.length - 16}
                                height={b.h}
                                fill={
                                    isLast
                                        ? "rgb(16 185 129)"
                                        : "currentColor"
                                }
                                fillOpacity={isLast ? 1 : 0.85}
                                rx="3"
                            />
                            {b.value !== null && (
                                <text
                                    x={b.x + (width / points.length - 16) / 2}
                                    y={b.y - 6}
                                    fontSize="9"
                                    fill="currentColor"
                                    fillOpacity="0.7"
                                    textAnchor="middle"
                                >
                                    {b.value.toFixed(1)}
                                </text>
                            )}
                        </g>
                    );
                })}

                {bars.map((b, i) => (
                    <text
                        key={i}
                        x={b.x + (width / points.length - 16) / 2}
                        y={height - padding.bottom + 18}
                        fontSize="10"
                        fill="currentColor"
                        fillOpacity="0.6"
                        textAnchor="middle"
                    >
                        {b.label}
                    </text>
                ))}
            </svg>
        </div>
    );
}
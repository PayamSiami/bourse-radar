"use client";

import { useEffect, useMemo, useState } from "react";
import { EarningsResponse, fetchEarnings } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

function faNum(n: number | null | undefined, digits = 0): string {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("fa-IR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function faPct(n: number | null | undefined, digits = 1): string {
    if (n === null || n === undefined) return "—";
    const s = Math.abs(n).toFixed(digits).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
    return `${n < 0 ? "-" : "+"}${s}٪`;
}

export function DividendsTab({ symbol }: { symbol: string }) {
    const [data, setData] = useState<EarningsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetchEarnings(symbol)
            .then(setData)
            .catch((e) => {
                setError(e instanceof Error ? e.message : "خطا در دریافت سودآوری");
                setData(null);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, [symbol]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-2xl skeleton" />
                    ))}
                </div>
                <div className="h-80 rounded-2xl skeleton" />
            </div>
        );
    }

    if (error) {
        return <TabError retry={load} />;
    }

    if (!data || data.quarterly.length === 0) {
        return (
            <TabEmpty
                title="داده سودآوری موجود نیست"
                body="برای این نماد هنوز صورت مالی فصلی از کدال استخراج نشده است. ممکن است در حال بروزرسانی باشد."
                icon="📊"
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <SummaryCard
                    label="EPS آخرین فصل"
                    value={data.summary.latest_eps !== null ? faNum(data.summary.latest_eps) : "—"}
                    unit="ریال"
                    icon="💰"
                />
                <SummaryCard
                    label="رشد EPS (YoY)"
                    value={faPct(data.summary.eps_growth_yoy)}
                    accent={
                        data.summary.eps_growth_yoy !== null && data.summary.eps_growth_yoy >= 0
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-red-600 dark:text-red-400"
                    }
                    icon="📈"
                />
                <SummaryCard
                    label="رشد سود خالص (YoY)"
                    value={faPct(data.summary.net_profit_growth_yoy)}
                    accent={
                        data.summary.net_profit_growth_yoy !== null &&
                            data.summary.net_profit_growth_yoy >= 0
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-red-600 dark:text-red-400"
                    }
                    icon="💵"
                />
                <SummaryCard
                    label="حاشیه سود آخرین فصل"
                    value={
                        data.summary.latest_margin !== null
                            ? `${(data.summary.latest_margin * 100).toFixed(1)}٪`
                            : "—"
                    }
                    accent={
                        data.summary.latest_margin !== null && data.summary.latest_margin > 0
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-red-600 dark:text-red-400"
                    }
                    icon="٪"
                />
            </div>

            {/* Chart: EPS trend */}
            <div className="rounded-2xl bg-surface border border-app p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h3 className="text-sm font-bold text-fg">روند EPS (ریال)</h3>
                    <div className="flex items-center gap-4 text-[10px] text-muted">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-brand-500" />
                            EPS فصلی
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-1 bg-amber-500" />
                            میانگین
                        </span>
                    </div>
                </div>
                <EPSChart quarterly={data.quarterly} />
            </div>

            {/* Chart: Net profit trend */}
            <div className="rounded-2xl bg-surface border border-app p-5">
                <h3 className="text-sm font-bold text-fg mb-4">
                    روند سود خالص (میلیارد ریال)
                </h3>
                <NetProfitChart quarterly={data.quarterly} />
            </div>

            {/* Table */}
            <div className="rounded-2xl bg-surface border border-app">
                <div className="p-4 border-b border-app">
                    <h3 className="text-sm font-bold text-fg">جزئیات فصلی</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-2">
                            <tr className="text-muted">
                                <th className="py-3 px-3 text-right font-medium">دوره</th>
                                <th className="py-3 px-3 text-left font-medium">EPS (ریال)</th>
                                <th className="py-3 px-3 text-left font-medium">
                                    سود خالص (م.ر)
                                </th>
                                <th className="py-3 px-3 text-left font-medium">حاشیه سود</th>
                                <th className="py-3 px-3 text-left font-medium">
                                    درآمد (م.ر)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.quarterly
                                .slice()
                                .reverse()
                                .map((q) => (
                                    <tr
                                        key={q.period_end}
                                        className="border-b border-app hover:bg-surface-2 transition"
                                    >
                                        <td className="py-2.5 px-3 text-right text-fg font-medium">
                                            {q.label} — Q{q.quarter}
                                        </td>
                                        <td className="py-2.5 px-3 text-left tabular text-fg">
                                            {faNum(q.eps_rials)}
                                        </td>
                                        <td className="py-2.5 px-3 text-left tabular text-fg">
                                            {faNum(q.net_profit_millions)}
                                        </td>
                                        <td
                                            className={`py-2.5 px-3 text-left tabular font-semibold ${q.net_margin !== null && q.net_margin > 0
                                                    ? "text-brand-600 dark:text-brand-400"
                                                    : "text-red-600 dark:text-red-400"
                                                }`}
                                        >
                                            {q.net_margin !== null
                                                ? `${(q.net_margin * 100).toFixed(1)}٪`
                                                : "—"}
                                        </td>
                                        <td className="py-2.5 px-3 text-left tabular text-muted">
                                            {faNum(q.revenue_millions)}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ---------- Subcomponents ---------- */

function SummaryCard({
    label,
    value,
    unit,
    icon,
    accent = "text-fg",
}: {
    label: string;
    value: string;
    unit?: string;
    icon?: string;
    accent?: string;
}) {
    return (
        <div className="rounded-2xl bg-surface border border-app p-4">
            <div className="flex items-center gap-2 mb-1.5">
                {icon && (
                    <span className="w-6 h-6 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px]">
                        {icon}
                    </span>
                )}
                <p className="text-[10px] text-muted">{label}</p>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`text-lg font-bold tabular ${accent}`}>{value}</span>
                {unit && <span className="text-[10px] text-muted">{unit}</span>}
            </div>
        </div>
    );
}

/* ---------- EPS Bar Chart ---------- */

function EPSChart({ quarterly }: { quarterly: EarningsResponse["quarterly"] }) {
    const width = 900;
    const height = 320;
    const padding = { top: 30, right: 40, bottom: 50, left: 50 };

    const values = quarterly.map((q) => q.eps_rials ?? 0);
    const max = Math.max(...values, 1);

    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const barWidth = innerW / quarterly.length - 12;
    const y = (v: number) => padding.top + innerH - (v / max) * innerH;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    const yTicks = Array.from({ length: 5 }, (_, i) => {
        const v = (max * i) / 4;
        return { v, y: y(v) };
    });

    return (
        <div className="text-muted">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
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
                            {t.v.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}
                        </text>
                    </g>
                ))}

                {quarterly.map((q, i) => {
                    const v = q.eps_rials ?? 0;
                    const isLast = i === quarterly.length - 1;
                    return (
                        <g key={i}>
                            <rect
                                x={padding.left + i * (innerW / quarterly.length) + 6}
                                y={y(v)}
                                width={barWidth}
                                height={innerH - (y(v) - padding.top)}
                                fill={isLast ? "rgb(16 185 129)" : "rgb(20 184 166)"}
                                fillOpacity={isLast ? 1 : 0.7}
                                rx="3"
                            />
                            <text
                                x={padding.left + i * (innerW / quarterly.length) + barWidth / 2 + 6}
                                y={y(v) - 6}
                                fontSize="10"
                                fill="currentColor"
                                fillOpacity="0.7"
                                textAnchor="middle"
                            >
                                {v.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}
                            </text>
                            <text
                                x={padding.left + i * (innerW / quarterly.length) + barWidth / 2 + 6}
                                y={height - padding.bottom + 18}
                                fontSize="10"
                                fill="currentColor"
                                fillOpacity="0.6"
                                textAnchor="middle"
                            >
                                {q.label}
                            </text>
                            <text
                                x={padding.left + i * (innerW / quarterly.length) + barWidth / 2 + 6}
                                y={height - padding.bottom + 32}
                                fontSize="9"
                                fill="currentColor"
                                fillOpacity="0.4"
                                textAnchor="middle"
                            >
                                Q{q.quarter}
                            </text>
                        </g>
                    );
                })}

                {/* Average line */}
                <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={y(avg)}
                    y2={y(avg)}
                    stroke="rgb(245 158 11)"
                    strokeWidth="1.5"
                    strokeDasharray="6 3"
                />
            </svg>
        </div>
    );
}

/* ---------- Net Profit Bar Chart ---------- */

function NetProfitChart({
    quarterly,
}: {
    quarterly: EarningsResponse["quarterly"];
}) {
    const width = 900;
    const height = 280;
    const padding = { top: 30, right: 40, bottom: 40, left: 60 };

    const values = quarterly.map((q) => q.net_profit_millions ?? 0);
    const max = Math.max(...values.map((v) => Math.abs(v)), 1);

    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const barWidth = innerW / quarterly.length - 12;

    const zeroY = padding.top + innerH / 2;
    const y = (v: number) => {
        const ratio = v / max;
        return zeroY - ratio * (innerH / 2);
    };

    return (
        <div className="text-muted">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                {/* Zero line */}
                <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={zeroY}
                    y2={zeroY}
                    stroke="currentColor"
                    strokeOpacity="0.2"
                />

                {/* Grid */}
                {[-1, -0.5, 0.5, 1].map((ratio, i) => {
                    const yPos = zeroY - (ratio * innerH) / 2;
                    const v = max * ratio;
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                x2={width - padding.right}
                                y1={yPos}
                                y2={yPos}
                                stroke="currentColor"
                                strokeOpacity="0.06"
                                strokeDasharray="3 4"
                            />
                            <text
                                x={padding.left - 6}
                                y={yPos + 4}
                                fontSize="9"
                                fill="currentColor"
                                fillOpacity="0.5"
                                textAnchor="end"
                            >
                                {v.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}
                            </text>
                        </g>
                    );
                })}

                {quarterly.map((q, i) => {
                    const v = q.net_profit_millions ?? 0;
                    const barY = v >= 0 ? y(v) : zeroY;
                    const barH = Math.abs(y(v) - zeroY);
                    const isLast = i === quarterly.length - 1;
                    const positive = v >= 0;

                    return (
                        <g key={i}>
                            <rect
                                x={padding.left + i * (innerW / quarterly.length) + 6}
                                y={barY}
                                width={barWidth}
                                height={barH}
                                fill={
                                    positive
                                        ? isLast
                                            ? "rgb(16 185 129)"
                                            : "rgb(20 184 166)"
                                        : "rgb(239 68 68)"
                                }
                                fillOpacity={isLast ? 1 : 0.75}
                                rx="3"
                            />
                            <text
                                x={padding.left + i * (innerW / quarterly.length) + barWidth / 2 + 6}
                                y={height - padding.bottom + 18}
                                fontSize="10"
                                fill="currentColor"
                                fillOpacity="0.6"
                                textAnchor="middle"
                            >
                                {q.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
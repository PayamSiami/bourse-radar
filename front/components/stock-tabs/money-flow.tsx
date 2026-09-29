"use client";

import { useEffect, useState } from "react";
import { PricePoint, fetchPriceHistory } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

function faNum(n: number | null | undefined, digits = 0): string {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString("fa-IR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function faDate(iso: string): string {
    return new Date(iso).toLocaleDateString("fa-IR", {
        month: "short",
        day: "2-digit",
    });
}

function faDateLong(iso: string): string {
    return new Date(iso).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

type Range = 30 | 60 | 90;

export function MoneyFlowTab({ symbol }: { symbol: string }) {
    const [points, setPoints] = useState<PricePoint[]>([]);
    const [range, setRange] = useState<Range>(30);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        setError(null);
        fetchPriceHistory(symbol, range)
            .then((res) => setPoints(res.points))
            .catch((e) => {
                setError(e instanceof Error ? e.message : "خطا در دریافت قیمت");
                setPoints([]);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
    }, [symbol, range]);

    const rows = points.map((p, i) => {
        const prev = points[i - 1];
        const delta = prev ? p.p - prev.p : 0;
        const volume = 0; // we don't have per-day volume here
        return {
            t: p.t,
            price: p.p,
            delta,
            positive: delta >= 0,
        };
    });

    return (
        <div className="space-y-4">
            {/* Chart card */}
            <div className="rounded-2xl bg-surface border border-app p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                            📊
                        </span>
                        جریان پول حقیقی
                    </h2>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-2">
                        {([30, 60, 90] as const).map((d) => (
                            <button
                                key={d}
                                onClick={() => setRange(d)}
                                className={`text-[10px] px-2.5 py-1 rounded-md transition ${range === d
                                        ? "bg-surface text-fg font-semibold shadow-sm"
                                        : "text-muted hover:text-fg"
                                    }`}
                            >
                                {d} روز
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-[10px] text-muted mb-4">
                    جریان پول حقیقی (میلیارد تومان)
                </p>

                {loading ? (
                    <div className="h-72 rounded-xl skeleton" />
                ) : error ? (
                    <TabError retry={load} />
                ) : points.length < 2 ? (
                    <TabEmpty
                        title="داده قیمت موجود نیست"
                        body="حداقل دو نقطه قیمت برای رسم نوار موجودی جریان پول نیاز است."
                        icon="📉"
                    />
                ) : (
                    <MoneyFlowChart points={points} />
                )}
            </div>

            {/* Table */}
            <div className="rounded-2xl bg-surface border border-app">
                <div className="p-4 border-b border-app">
                    <h3 className="text-sm font-bold text-fg">جزئیات روزانه</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-2">
                            <tr className="text-muted">
                                <th className="py-3 px-3 text-right font-medium">تاریخ</th>
                                <th className="py-3 px-3 text-left font-medium">قیمت پایانی</th>
                                <th className="py-3 px-3 text-left font-medium">تغییر قیمت</th>
                                <th className="py-3 px-3 text-left font-medium">سرانه خرید</th>
                                <th className="py-3 px-3 text-left font-medium">قدرت خرید</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice().reverse().map((r, i) => (
                                <tr
                                    key={r.t}
                                    className="border-b border-app hover:bg-surface-2 transition"
                                >
                                    <td className="py-2.5 px-3 text-right text-fg font-medium">
                                        {faDateLong(r.t)}
                                    </td>
                                    <td className="py-2.5 px-3 text-left tabular text-fg">
                                        {faNum(r.price)}
                                    </td>
                                    <td
                                        className={`py-2.5 px-3 text-left tabular font-semibold ${r.positive
                                                ? "text-brand-600 dark:text-brand-400"
                                                : "text-red-600 dark:text-red-400"
                                            }`}
                                    >
                                        {r.positive ? "+" : ""}
                                        {faNum(r.delta)}
                                    </td>
                                    <td className="py-2.5 px-3 text-left tabular text-muted">
                                        —
                                    </td>
                                    <td className="py-2.5 px-3 text-left tabular text-muted">
                                        —
                                    </td>
                                </tr>
                            ))}

                            {rows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="py-8 text-center text-muted text-xs"
                                    >
                                        داده‌ای موجود نیست
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/* ---------- Combo chart: lines + bars ---------- */

function MoneyFlowChart({ points }: { points: PricePoint[] }) {
    const width = 900;
    const height = 320;
    const padding = { top: 20, right: 50, bottom: 40, left: 40 };

    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const prices = points.map((p) => p.p);
    const deltas = points.map((p, i) => (i === 0 ? 0 : p.p - points[i - 1]!.p));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const maxDelta = Math.max(...deltas.map((d) => Math.abs(d)), 1);

    const x = (i: number) => padding.left + (i / (points.length - 1)) * innerW;
    const yPrice = (p: number) =>
        padding.top + innerH - ((p - minPrice) / (maxPrice - minPrice || 1)) * innerH;
    const yDelta = (d: number) =>
        padding.top + innerH / 2 - (d / maxDelta) * (innerH / 2);

    // Two lines: a smoothed price and a moving average
    const linePath = points
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${yPrice(p.p)}`)
        .join(" ");

    // Simple 5-point moving average
    const maWindow = 5;
    const maPoints = prices.map((_, i) => {
        const from = Math.max(0, i - maWindow + 1);
        const slice = prices.slice(from, i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    const maPath = maPoints
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${yPrice(p)}`)
        .join(" ");

    const barWidth = Math.max(2, innerW / points.length - 2);

    return (
        <div className="text-muted">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                {/* Y grid */}
                {Array.from({ length: 5 }).map((_, i) => {
                    const v = minPrice + ((maxPrice - minPrice) * i) / 4;
                    const y = yPrice(v);
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                x2={width - padding.right}
                                y1={y}
                                y2={y}
                                stroke="currentColor"
                                strokeOpacity="0.08"
                                strokeDasharray="3 4"
                            />
                            <text
                                x={width - padding.right + 6}
                                y={y + 4}
                                fontSize="10"
                                fill="currentColor"
                                fillOpacity="0.5"
                            >
                                {v.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}
                            </text>
                        </g>
                    );
                })}

                {/* Zero line (delta) */}
                <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={padding.top + innerH / 2}
                    y2={padding.top + innerH / 2}
                    stroke="currentColor"
                    strokeOpacity="0.15"
                />

                {/* Delta bars (background) */}
                {deltas.map((d, i) => {
                    if (i === 0) return null;
                    const barH = Math.abs((d / maxDelta) * (innerH / 2));
                    const barY = d >= 0 ? padding.top + innerH / 2 - barH : padding.top + innerH / 2;
                    return (
                        <rect
                            key={i}
                            x={x(i) - barWidth / 2}
                            y={barY}
                            width={barWidth}
                            height={barH}
                            fill={
                                d >= 0
                                    ? "rgb(16 185 129)"
                                    : "rgb(239 68 68)"
                            }
                            opacity="0.5"
                            rx="1"
                        />
                    );
                })}

                {/* Price line */}
                <path
                    d={linePath}
                    fill="none"
                    stroke="rgb(20 184 166)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                />

                {/* Moving average */}
                <path
                    d={maPath}
                    fill="none"
                    stroke="rgb(245 158 11)"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    opacity="0.8"
                />

                {/* X labels (every ~7th point) */}
                {points.map((p, i) => {
                    if (i % Math.ceil(points.length / 8) !== 0) return null;
                    return (
                        <text
                            key={i}
                            x={x(i)}
                            y={height - padding.bottom + 18}
                            fontSize="10"
                            fill="currentColor"
                            fillOpacity="0.6"
                            textAnchor="middle"
                        >
                            {faDate(p.t)}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
}
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Bar,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { PricePoint, fetchPriceHistory } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

// ──────────────────────────────────────────────────────────
// Formatting
// ──────────────────────────────────────────────────────────

const faInt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faCompact = new Intl.NumberFormat("fa-IR", {
    notation: "compact",
    maximumFractionDigits: 1,
});

function faDate(iso: string) {
    return new Date(iso).toLocaleDateString("fa-IR", {
        month: "short",
        day: "2-digit",
    });
}
function faDateLong(iso: string) {
    return new Date(iso).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

// ──────────────────────────────────────────────────────────
// Range control
// ──────────────────────────────────────────────────────────

const RANGES = [
    { value: 30, label: "۳۰ روز" },
    { value: 90, label: "۳ ماه" },
    { value: 180, label: "۶ ماه" },
    { value: 365, label: "۱ سال" },
] as const;
type Range = (typeof RANGES)[number]["value"];

// ──────────────────────────────────────────────────────────
// Tab
// ──────────────────────────────────────────────────────────

export function MoneyFlowTab({ symbol }: { symbol: string }) {
    const [points, setPoints] = useState<PricePoint[]>([]);
    const [range, setRange] = useState<Range>(90);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const reqId = useRef(0);

    const load = () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        fetchPriceHistory(symbol, range)
            .then((res) => {
                if (id !== reqId.current) return; // stale — drop
                setPoints(res.points);
            })
            .catch((e: unknown) => {
                if (id !== reqId.current) return;
                setError(e instanceof Error ? e.message : "خطا در دریافت قیمت");
                setPoints([]);
            })
            .finally(() => {
                if (id === reqId.current) setLoading(false);
            });
    };

    useEffect(load, [symbol, range]);

    const rows = useMemo(() => {
        const win = 5;
        return points.map((p, i) => {
            const prev = points[i - 1];
            const delta = prev ? p.p - prev.p : null;
            const pct = prev && prev.p !== 0 ? ((p.p - prev.p) / prev.p) * 100 : null;
            const from = Math.max(0, i - win + 1);
            const slice = points.slice(from, i + 1).map((x) => x.p);
            const ma = slice.reduce((a, b) => a + b, 0) / slice.length;
            return { t: p.t, price: p.p, delta, pct, ma };
        });
    }, [points]);

    return (
        <div className="space-y-4">
            {/* Chart card */}
            <div className="rounded-2xl border border-app bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app px-5 py-4">
                    <div>
                        <h2 className="text-sm font-bold text-fg">روند قیمت</h2>
                        <p className="mt-0.5 text-[10px] text-muted">
                            قیمت پایانی، میانگین متحرک ۵ روزه و تغییر روزانه (ریال)
                        </p>
                    </div>

                    <div className="flex items-center rounded-lg border border-app bg-surface-2/60 p-0.5">
                        {RANGES.map((r) => (
                            <button
                                key={r.value}
                                onClick={() => setRange(r.value)}
                                aria-pressed={range === r.value}
                                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${range === r.value
                                        ? "bg-surface text-fg shadow-sm"
                                        : "text-muted hover:text-fg"
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="h-[380px] animate-pulse rounded-xl bg-surface-2" />
                    ) : error ? (
                        <div className="h-[380px]">
                            <TabError retry={load} />
                        </div>
                    ) : rows.length < 2 ? (
                        <div className="h-[380px]">
                            <TabEmpty
                                title="داده قیمت موجود نیست"
                                body="برای رسم نمودار به حداقل دو نقطه قیمت نیاز است."
                                icon="📉"
                            />
                        </div>
                    ) : (
                        <>
                            <Legend />
                            <PriceChart rows={rows} />
                        </>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-app bg-surface">
                <div className="border-b border-app p-4">
                    <h3 className="text-sm font-bold text-fg">جزئیات روزانه</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-2 text-muted">
                            <tr>
                                <th className="px-3 py-2.5 text-right font-medium">تاریخ</th>
                                <th className="px-3 py-2.5 text-left font-medium">قیمت پایانی (ریال)</th>
                                <th className="px-3 py-2.5 text-left font-medium">تغییر (ریال)</th>
                                <th className="px-3 py-2.5 text-left font-medium">تغییر ٪</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows
                                .slice()
                                .reverse()
                                .map((r) => {
                                    const tone =
                                        r.delta == null
                                            ? "text-muted"
                                            : r.delta > 0
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : r.delta < 0
                                                    ? "text-red-600 dark:text-red-400"
                                                    : "text-muted";
                                    return (
                                        <tr
                                            key={r.t}
                                            className="border-b border-app transition last:border-0 hover:bg-surface-2"
                                        >
                                            <td className="px-3 py-2.5 text-right font-medium text-fg">
                                                {faDateLong(r.t)}
                                            </td>
                                            <td className="px-3 py-2.5 text-left font-mono tabular-nums text-fg">
                                                {faInt.format(r.price)}
                                            </td>
                                            <td
                                                className={`px-3 py-2.5 text-left font-mono tabular-nums font-semibold ${tone}`}
                                            >
                                                {r.delta == null
                                                    ? "—"
                                                    : `${r.delta > 0 ? "+" : ""}${faInt.format(r.delta)}`}
                                            </td>
                                            <td
                                                className={`px-3 py-2.5 text-left font-mono tabular-nums font-semibold ${tone}`}
                                            >
                                                {r.pct == null
                                                    ? "—"
                                                    : `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(2)}٪`}
                                            </td>
                                        </tr>
                                    );
                                })}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-8 text-center text-xs text-muted">
                                        دادهای موجود نیست
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

// ──────────────────────────────────────────────────────────
// Chart
// ──────────────────────────────────────────────────────────

type ChartRow = {
    t: string;
    price: number;
    delta: number | null;
    pct: number | null;
    ma: number;
};

function PriceChart({ rows }: { rows: ChartRow[] }) {
    return (
        <div className="text-fg" style={{ direction: "ltr" }}>
            <ResponsiveContainer width="100%" height={380}>
                <ComposedChart
                    data={rows}
                    margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                >
                    <defs>
                        <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="currentColor"
                        strokeOpacity={0.08}
                        vertical={false}
                    />

                    {/* Price axis (left) */}
                    <YAxis
                        yAxisId="price"
                        orientation="right"
                        domain={["dataMin - 200", "dataMax + 200"]}
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tickFormatter={(v: number) => faCompact.format(v)}
                    />

                    {/* Delta axis (right, hidden labels — bars read from scale alone) */}
                    <YAxis
                        yAxisId="delta"
                        orientation="left"
                        domain={[-"dataMax", "dataMax"] as unknown as [number, number]}
                        hide
                    />

                    <XAxis
                        dataKey="t"
                        reversed
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={48}
                        tickFormatter={faDate}
                    />

                    <ReferenceLine
                        yAxisId="delta"
                        y={0}
                        stroke="currentColor"
                        strokeOpacity={0.18}
                    />

                    <Tooltip
                        cursor={{
                            stroke: "currentColor",
                            strokeOpacity: 0.25,
                            strokeDasharray: "3 3",
                        }}
                        contentStyle={{
                            background: "rgb(var(--surface))",
                            border: "1px solid rgb(var(--app))",
                            borderRadius: 10,
                            fontSize: 11,
                            direction: "rtl",
                            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                        }}
                        labelStyle={{ color: "rgb(var(--muted))", fontSize: 10 }}
                        labelFormatter={(v) => faDateLong(String(v))}
                        formatter={(value, name) => {
                            if (name === "price") return [faInt.format(value as number), "قیمت پایانی"];
                            if (name === "ma") return [faInt.format(value as number), "میانگین ۵ روزه"];
                            if (name === "delta") {
                                const n = value as number;
                                return [`${n > 0 ? "+" : ""}${faInt.format(n)}`, "تغییر روزانه"];
                            }
                            return [String(value), String(name)];
                        }}
                    />

                    {/* Change bars on secondary axis */}
                    <Bar yAxisId="delta" dataKey="delta" barSize={6} radius={[2, 2, 0, 0]}>
                        {rows.map((r, i) => (
                            <Cell
                                key={i}
                                fill={
                                    r.delta == null
                                        ? "#94a3b8"
                                        : r.delta > 0
                                            ? "#10b981"
                                            : r.delta < 0
                                                ? "#ef4444"
                                                : "#94a3b8"
                                }
                                fillOpacity={0.45}
                            />
                        ))}
                    </Bar>

                    {/* Price line */}
                    <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                        isAnimationActive={false}
                    />

                    {/* 5-day MA */}
                    <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="ma"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Legend
// ──────────────────────────────────────────────────────────

function Legend() {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-teal-500" />
                قیمت پایانی
            </span>
            <span className="flex items-center gap-1.5">
                <span
                    className="h-0.5 w-4 rounded-full"
                    style={{
                        backgroundImage:
                            "repeating-linear-gradient(90deg, rgb(245 158 11) 0 3px, transparent 3px 6px)",
                    }}
                />
                میانگین ۵ روزه
            </span>
            <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-emerald-500/60" />
                روز صعودی
            </span>
            <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-red-500/60" />
                روز نزولی
            </span>
        </div>
    );
}
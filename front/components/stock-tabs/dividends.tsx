"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Bar,
    BarChart,
    Cell,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { EarningsResponse, fetchEarnings } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

// ──────────────────────────────────────────────────────────
// Formatters
// ──────────────────────────────────────────────────────────

const faInt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faOne = new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
const faCompact = new Intl.NumberFormat("fa-IR", {
    notation: "compact",
    maximumFractionDigits: 1,
});

/** Signed percent, always Persian digits, proper minus. */
function faPct(n: number | null | undefined, digits = 1): string {
    if (n == null) return "—";
    const factor = 10 ** digits;
    const rounded = Math.round(n * factor) / factor;
    if (rounded === 0) return `۰٪`;
    const sign = rounded < 0 ? "−" : "+";
    const abs = Math.abs(rounded).toFixed(digits);
    const persian = abs.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
    return `${sign}${persian}٪`;
}

/** Ratio (0.12) → "۱۲.۰٪". */
function ratioToPct(n: number | null | undefined, digits = 1): string {
    if (n == null) return "—";
    return `${faOne.format(n * 100)}٪`;
}

// ──────────────────────────────────────────────────────────
// Tab
// ──────────────────────────────────────────────────────────

export function DividendsTab({ symbol }: { symbol: string }) {
    const [data, setData] = useState<EarningsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const reqId = useRef(0);

    const load = () => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);
        fetchEarnings(symbol)
            .then((res) => {
                if (id !== reqId.current) return;
                setData(res);
            })
            .catch((e: unknown) => {
                if (id !== reqId.current) return;
                setError(e instanceof Error ? e.message : "خطا در دریافت سودآوری");
                setData(null);
            })
            .finally(() => {
                if (id === reqId.current) setLoading(false);
            });
    };

    useEffect(load, [symbol]);

    // ── Loading ────────────────────────────────────────────
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-24 animate-pulse rounded-2xl bg-surface-2"
                        />
                    ))}
                </div>
                <div className="h-80 animate-pulse rounded-2xl bg-surface-2" />
            </div>
        );
    }

    if (error) return <TabError retry={load} />;

    if (!data?.quarterly?.length || !data.summary) {
        return (
            <TabEmpty
                title="داده سودآوری موجود نیست"
                body="برای این نماد هنوز صورت مالی فصلی از کدال استخراج نشده است. ممکن است در حال بروزرسانی باشد."
                icon="📊"
            />
        );
    }

    const { summary, quarterly } = data;

    return (
        <div className="space-y-4">
            {/* ── Summary cards ─────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryCard
                    label="EPS آخرین فصل"
                    value={faInt.format(summary.latest_eps ?? 0)}
                    unit="ریال"
                    tone={summary.latest_eps != null && summary.latest_eps > 0 ? "up" : "neutral"}
                />
                <SummaryCard
                    label="رشد EPS (YoY)"
                    value={faPct(summary.eps_growth_yoy)}
                    tone={
                        summary.eps_growth_yoy == null
                            ? "neutral"
                            : summary.eps_growth_yoy > 0
                                ? "up"
                                : summary.eps_growth_yoy < 0
                                    ? "down"
                                    : "neutral"
                    }
                />
                <SummaryCard
                    label="رشد سود خالص (YoY)"
                    value={faPct(summary.net_profit_growth_yoy)}
                    tone={
                        summary.net_profit_growth_yoy == null
                            ? "neutral"
                            : summary.net_profit_growth_yoy > 0
                                ? "up"
                                : summary.net_profit_growth_yoy < 0
                                    ? "down"
                                    : "neutral"
                    }
                />
                <SummaryCard
                    label="حاشیه سود آخرین فصل"
                    value={ratioToPct(summary.latest_margin)}
                    tone={
                        summary.latest_margin == null
                            ? "neutral"
                            : summary.latest_margin > 0
                                ? "up"
                                : "down"
                    }
                />
            </div>

            {/* ── EPS chart ─────────────────────────────────── */}
            <Section title="روند EPS فصلی" subtitle="ریال">
                <Legend
                    items={[
                        { color: "#10b981", shape: "bar", label: "EPS فصلی" },
                        { color: "#f59e0b", shape: "dashed", label: "میانگین" },
                    ]}
                />
                <EPSChart quarterly={quarterly} />
            </Section>

            {/* ── Net profit chart ──────────────────────────── */}
            <Section title="روند سود خالص فصلی" subtitle="میلیون ریال">
                <NetProfitChart quarterly={quarterly} />
            </Section>

            {/* ── Table ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-app bg-surface">
                <div className="border-b border-app p-4">
                    <h3 className="text-sm font-bold text-fg">جزئیات فصلی</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-2 text-muted">
                            <tr>
                                <th className="px-3 py-2.5 text-right font-medium">دوره</th>
                                <th className="px-3 py-2.5 text-left font-medium">EPS (ریال)</th>
                                <th className="px-3 py-2.5 text-left font-medium">
                                    سود خالص (م.ر)
                                </th>
                                <th className="px-3 py-2.5 text-left font-medium">حاشیه سود</th>
                                <th className="px-3 py-2.5 text-left font-medium">
                                    درآمد (م.ر)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {quarterly
                                .slice()
                                .reverse()
                                .map((q) => {
                                    const marginTone =
                                        q.net_margin == null
                                            ? "text-muted"
                                            : q.net_margin > 0
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-red-600 dark:text-red-400";
                                    return (
                                        <tr
                                            key={`${q.period_end}-${q.quarter}`}
                                            className="border-b border-app transition last:border-0 hover:bg-surface-2"
                                        >
                                            <td className="px-3 py-2.5 text-right font-medium text-fg">
                                                {q.label} — Q{q.quarter}
                                            </td>
                                            <td className="px-3 py-2.5 text-left font-mono tabular-nums text-fg">
                                                {q.eps_rials == null ? "—" : faInt.format(q.eps_rials)}
                                            </td>
                                            <td className="px-3 py-2.5 text-left font-mono tabular-nums text-fg">
                                                {q.net_profit_millions == null
                                                    ? "—"
                                                    : faInt.format(q.net_profit_millions)}
                                            </td>
                                            <td
                                                className={`px-3 py-2.5 text-left font-mono tabular-nums font-semibold ${marginTone}`}
                                            >
                                                {ratioToPct(q.net_margin)}
                                            </td>
                                            <td className="px-3 py-2.5 text-left font-mono tabular-nums text-muted">
                                                {q.revenue_millions == null
                                                    ? "—"
                                                    : faInt.format(q.revenue_millions)}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Chart wrappers
// ──────────────────────────────────────────────────────────

type Q = EarningsResponse["quarterly"][number];

function EPSChart({ quarterly }: { quarterly: Q[] }) {
    const rows = useMemo(
        () =>
            quarterly.map((q) => ({
                label: `${q.label} Q${q.quarter}`,
                eps: q.eps_rials ?? 0,
            })),
        [quarterly],
    );

    const avg =
        rows.reduce((a, r) => a + r.eps, 0) / Math.max(rows.length, 1);

    return (
        <div className="text-fg" style={{ direction: "ltr" }}>
            <ResponsiveContainer width="100%" height={320}>
                <ComposedChart
                    data={rows}
                    margin={{ top: 20, right: 12, left: 4, bottom: 4 }}
                >
                    <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="currentColor"
                        strokeOpacity={0.08}
                        vertical={false}
                    />
                    <XAxis
                        dataKey="label"
                        reversed
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={20}
                    />
                    <YAxis
                        orientation="right"
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={(v: number) => faCompact.format(v)}
                        domain={["auto", "auto"]}
                    />
                    <Tooltip
                        cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                        contentStyle={{
                            background: "rgb(var(--surface))",
                            border: "1px solid rgb(var(--app))",
                            borderRadius: 10,
                            fontSize: 11,
                            direction: "rtl",
                        }}
                        formatter={(v) => [`${faInt.format(v as number)} ریال`, "EPS"]}
                    />
                    <ReferenceLine
                        y={avg}
                        stroke="#f59e0b"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                    />
                    <Bar dataKey="eps" radius={[3, 3, 0, 0]}>
                        {rows.map((_, i) => (
                            <Cell
                                key={i}
                                fill={i === rows.length - 1 ? "#10b981" : "#14b8a6"}
                                fillOpacity={i === rows.length - 1 ? 1 : 0.7}
                            />
                        ))}
                    </Bar>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

function NetProfitChart({ quarterly }: { quarterly: Q[] }) {
    const rows = useMemo(
        () =>
            quarterly.map((q) => ({
                label: `${q.label} Q${q.quarter}`,
                profit: q.net_profit_millions ?? 0,
            })),
        [quarterly],
    );

    return (
        <div className="text-fg" style={{ direction: "ltr" }}>
            <ResponsiveContainer width="100%" height={280}>
                <BarChart
                    data={rows}
                    margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
                >
                    <CartesianGrid
                        strokeDasharray="2 4"
                        stroke="currentColor"
                        strokeOpacity={0.08}
                        vertical={false}
                    />
                    <XAxis
                        dataKey="label"
                        reversed
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={20}
                    />
                    <YAxis
                        orientation="right"
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        tickFormatter={(v: number) => faCompact.format(v)}
                    />
                    <Tooltip
                        cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                        contentStyle={{
                            background: "rgb(var(--surface))",
                            border: "1px solid rgb(var(--app))",
                            borderRadius: 10,
                            fontSize: 11,
                            direction: "rtl",
                        }}
                        formatter={(v) => [
                            `${faInt.format(v as number)} م.ر`,
                            "سود خالص",
                        ]}
                    />
                    <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
                    <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
                        {rows.map((r, i) => (
                            <Cell
                                key={i}
                                fill={r.profit >= 0 ? "#10b981" : "#ef4444"}
                                fillOpacity={i === rows.length - 1 ? 1 : 0.75}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Small pieces
// ──────────────────────────────────────────────────────────

function Section({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-app bg-surface">
            <div className="flex items-center justify-between border-b border-app px-5 py-4">
                <h3 className="text-sm font-bold text-fg">{title}</h3>
                {subtitle && <span className="text-[10px] text-muted">{subtitle}</span>}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

function Legend({
    items,
}: {
    items: { color: string; shape: "bar" | "dashed" | "line"; label: string }[];
}) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[10px] text-muted">
            {items.map((it) => (
                <span key={it.label} className="flex items-center gap-1.5">
                    {it.shape === "bar" && (
                        <span
                            className="h-2 w-2 rounded-sm"
                            style={{ background: it.color }}
                        />
                    )}
                    {it.shape === "dashed" && (
                        <span
                            className="h-0.5 w-4"
                            style={{
                                backgroundImage: `repeating-linear-gradient(90deg, ${it.color} 0 3px, transparent 3px 6px)`,
                            }}
                        />
                    )}
                    {it.shape === "line" && (
                        <span
                            className="h-0.5 w-4 rounded-full"
                            style={{ background: it.color }}
                        />
                    )}
                    {it.label}
                </span>
            ))}
        </div>
    );
}

type Tone = "up" | "down" | "neutral";

function SummaryCard({
    label,
    value,
    unit,
    tone = "neutral",
}: {
    label: string;
    value: string;
    unit?: string;
    tone?: Tone;
}) {
    const toneClass =
        tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
                ? "text-red-600 dark:text-red-400"
                : "text-fg";

    return (
        <div className="rounded-2xl border border-app bg-surface p-4">
            <p className="text-[10px] font-medium text-muted">{label}</p>
            <div className="mt-1 flex items-baseline gap-1">
                <span
                    className={`text-lg font-bold tabular-nums ${toneClass}`}
                >
                    {value}
                </span>
                {unit && (
                    <span className="text-[10px] font-normal text-muted">{unit}</span>
                )}
            </div>
        </div>
    );
}
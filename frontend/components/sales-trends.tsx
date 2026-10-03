"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchSalesTrends, SalesTrendItem } from "@/lib/api";
import { faPercent } from "@/lib/format";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type Metric = "mom" | "cumulative";

type Props = {
    title: string;
    items: SalesTrendItem[];
    mode: "gain" | "loss";
    metric: Metric;
    loading?: boolean;
};

const faInt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

// ──────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────

function TrendCard({ title, items, mode, metric, loading }: Props) {
    const isGain = mode === "gain";

    return (
        <div className="flex h-full flex-col rounded-2xl border border-app bg-surface p-5">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
                <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${isGain
                            ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                            : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                        }`}
                >
                    {isGain ? (
                        <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden="true"
                        >
                            <path d="M7 17L17 7M17 7H8M17 7V16" />
                        </svg>
                    ) : (
                        <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden="true"
                        >
                            <path d="M17 7L7 17M7 17H16M7 17V8" />
                        </svg>
                    )}
                </div>
                <h3 className="text-sm font-bold text-fg">{title}</h3>
            </div>

            {/* List */}
            <div className="flex-1">
                {loading ? (
                    <div className="space-y-3">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div
                                key={i}
                                className="h-12 animate-pulse rounded bg-surface-2"
                            />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted">
                        دادهای موجود نیست
                    </p>
                ) : (
                    <ol className="space-y-1">
                        {items.map((item, i) => (
                            <TrendRow
                                key={`${item.symbol}-${i}`}
                                item={item}
                                rank={i + 1}
                                mode={mode}
                                metric={metric}
                            />
                        ))}
                    </ol>
                )}
            </div>

            {/* Footer */}
            <div className="mt-5 border-t border-app pt-4">
                <Link
                    href="/stocks"
                    className="flex items-center justify-center gap-1 text-[11px] text-muted transition hover:text-brand-600 dark:hover:text-brand-400"
                >
                    مشاهده همه سهام
                    <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                    >
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────

function TrendRow({
    item,
    rank,
    mode,
    metric,
}: {
    item: SalesTrendItem;
    rank: number;
    mode: "gain" | "loss";
    metric: Metric;
}) {
    const isGain = mode === "gain";

    // Read the right field for the metric, then coerce defensively.
    const raw =
        metric === "cumulative"
            ? item.growth_percent
            : item.change_percent;
    const n = raw == null ? NaN : Number(raw);
    const pct = Number.isFinite(n) ? n : null;

    // Month label — shorter for MoM cards, full date for cumulative.
    const dateLabel = item.month_end
        ? new Date(item.month_end).toLocaleDateString("fa-IR", {
            year: "numeric",
            month: "long",
        })
        : "";

    const tone = isGain
        ? "text-brand-600 dark:text-brand-400"
        : "text-red-600 dark:text-red-400";

    return (
        <li>
            <Link
                href={`/stocks/${encodeURIComponent(item.symbol)}`}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-surface-2"
            >
                {/* Rank */}
                <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted">
                    {faInt.format(rank)}
                </span>

                {/* Symbol + name */}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg transition group-hover:text-brand-600 dark:group-hover:text-brand-400">
                        {item.symbol}
                    </p>
                    <p className="truncate text-[10px] text-muted">{item.name}</p>
                </div>

                {/* Value + date */}
                <div className="shrink-0 text-left">
                    {pct !== null ? (
                        <p className={`text-sm font-bold tabular-nums ${tone}`}>
                            {isGain ? "▲" : "▼"} {faPercent(Math.abs(pct))}
                        </p>
                    ) : (
                        <p className="text-sm font-bold text-muted">—</p>
                    )}
                    {dateLabel && (
                        <p className="text-[10px] tabular-nums text-muted">{dateLabel}</p>
                    )}
                </div>
            </Link>
        </li>
    );
}

// ──────────────────────────────────────────────────────────
// Section
// ──────────────────────────────────────────────────────────

export function SalesTrends() {
    const [data, setData] = useState<Awaited<
        ReturnType<typeof fetchSalesTrends>
    > | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const reqId = useRef(0);

    useEffect(() => {
        const id = ++reqId.current;
        setLoading(true);
        setError(null);

        fetchSalesTrends()
            .then((res) => {
                if (id !== reqId.current) return;
                setData(res);
            })
            .catch((e: unknown) => {
                if (id !== reqId.current) return;
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (id === reqId.current) setLoading(false);
            });
    }, []);

    if (error) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                خطا در بارگذاری دادهها: {error}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
            <TrendCard
                title="بیشترین رشد فروش ماهانه"
                items={data?.gainers ?? []}
                mode="gain"
                metric="mom"
                loading={loading}
            />
            <TrendCard
                title="بیشترین افت فروش ماهانه"
                items={data?.losers ?? []}
                mode="loss"
                metric="mom"
                loading={loading}
            />
            <TrendCard
                title="بیشترین رشد فروش تجمعی"
                items={data?.cumulative ?? []}
                mode="gain"
                metric="cumulative"
                loading={loading}
            />
        </div>
    );
}
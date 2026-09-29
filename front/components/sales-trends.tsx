"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSalesTrends, SalesTrendItem } from "@/lib/api";
import { faPercent } from "@/lib/format";

type Props = {
    title: string;
    items: SalesTrendItem[];
    mode: "gain" | "loss";
    loading?: boolean;
};

function TrendCard({ title, items, mode, loading }: Props) {
    const isGain = mode === "gain";

    return (
        <div className="rounded-2xl bg-surface border border-app p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${isGain
                            ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                            : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                >
                    {isGain ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M7 17L17 7M17 7H8M17 7V16" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M17 7L7 17M7 17H16M7 17V8" />
                        </svg>
                    )}
                </div>
                <h3 className="text-sm font-bold text-fg">{title}</h3>
            </div>

            {/* List */}
            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-12 rounded skeleton" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className="text-xs text-muted text-center py-8">داده‌ای موجود نیست</p>
            ) : (
                <ol className="space-y-3">
                    {items.map((item, i) => {
  const rawPct = item.change_percent ?? item.growth_percent;
  const pct =
    rawPct !== null && rawPct !== undefined ? Number(rawPct) : null;

  const monthLabel = item.month_end
    ? new Date(item.month_end).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "";

  return (
    <li key={item.symbol}>
      <Link
        href={`/stocks/${encodeURIComponent(item.symbol)}`}
        className="flex items-center gap-3 group"
      >
        {/* Rank */}
        <span className="text-[10px] text-muted w-4 tabular">
          {i + 1}
        </span>

        {/* Symbol + name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-fg truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">
            {item.symbol}
          </p>
          <p className="text-[10px] text-muted truncate">{item.name}</p>
        </div>

        {/* Percent + date */}
        <div className="text-left shrink-0">
          {pct !== null ? (
            <p
              className={`text-sm font-bold tabular ${
                isGain
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {faPercent(pct)}
            </p>
          ) : (
            <p className="text-sm font-bold text-muted">—</p>
          )}
          {monthLabel && (
            <p className="text-[10px] text-muted tabular">{monthLabel}</p>
          )}
        </div>
      </Link>
    </li>
  );
})}
                </ol>
            )}

            {/* Footer link */}
            <div className="mt-5 pt-4 border-t border-app flex justify-center">
                <Link
                    href="/stocks"
                    className="text-[11px] text-muted hover:text-brand-600 dark:hover:text-brand-400 transition flex items-center gap-1"
                >
                    مشاهده همه در دیدبان نگر
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}

export function SalesTrends() {
    const [data, setData] = useState<Awaited<ReturnType<typeof fetchSalesTrends>> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchSalesTrends()
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    if (error) {
        return (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4 text-red-700 dark:text-red-400 text-sm">
                ⚠️ خطا در بارگذاری داده‌ها: {error}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TrendCard
                title="بیشترین رشد فروش نسبت به ماه قبل"
                items={data?.gainers ?? []}
                mode="gain"
                loading={loading}
            />
            <TrendCard
                title="بیشترین افت فروش نسبت به ماه قبل"
                items={data?.losers ?? []}
                mode="loss"
                loading={loading}
            />
            <TrendCard
                title="بیشترین رشد فروش تجمعی"
                items={data?.cumulative ?? []}
                mode="gain"
                loading={loading}
            />
        </div>
    );
}
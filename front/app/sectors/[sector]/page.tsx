"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchSectorAssets, SectorAsset } from "@/lib/api";

function faNum(n: number | string | null | undefined): string {
    if (n === null || n === undefined) return "—";
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

function faPct(n: number | null | undefined): string {
    if (n === null || n === undefined) return "—";
    const formatted = Math.abs(n).toFixed(1);
    return `${n < 0 ? "-" : ""}${formatted.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!)}٪`;
}

function faMarketCap(n: number | null | undefined): string {
    if (n === null || n === undefined) return "—";
    // Input is billion IRR, show as هـمـت (هزار میلیارد تومان) or as-is
    // Simple: show as عدد با جداکننده
    return faNum(Math.round(n).toLocaleString("en-US"));
}

type SortKey = "symbol" | "market_cap" | "forward_pe" | "eps" | "net_margin" | "sales_growth_mom" | "sales_growth_ytd";

export default function SectorDetailPage() {
    const params = useParams();
    const sector = decodeURIComponent(String(params.sector ?? ""));

    const [data, setData] = useState<SectorAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sort, setSort] = useState<SortKey>("market_cap");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    useEffect(() => {
        if (!sector) return;
        fetchSectorAssets(sector)
            .then((res) => setData(res.data))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [sector]);

    const sorted = useMemo(() => {
        const copy = [...data];
        const dir = sortDir === "asc" ? 1 : -1;

        return copy.sort((a, b) => {
            const av = a[sort];
            const bv = b[sort];
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            if (typeof av === "string" && typeof bv === "string") {
                return av.localeCompare(bv, "fa") * dir;
            }
            return (Number(av) - Number(bv)) * dir;
        });
    }, [data, sort, sortDir]);

    function toggleSort(key: SortKey) {
        if (sort === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSort(key);
            setSortDir("desc");
        }
    }

    return (
        <main className="flex-1 bg-app">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Breadcrumb */}
                <div className="mb-6 flex items-center gap-2 text-xs text-muted">
                    <Link href="/sectors" className="hover:text-fg transition">
                        ← بازگشت به گروه‌ها
                    </Link>
                </div>

                {/* Panel */}
                <div className="rounded-2xl bg-surface border border-app">
                    {/* Header */}
                    <div className="p-5 border-b border-app">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="7" height="7" rx="1" />
                                        <rect x="14" y="3" width="7" height="7" rx="1" />
                                        <rect x="3" y="14" width="7" height="7" rx="1" />
                                        <rect x="14" y="14" width="7" height="7" rx="1" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold text-fg">دیده‌بان نگر — {sector}</h1>
                                    <p className="text-[11px] text-muted">
                                        {faNum(data.length)} نماد · به‌روزرسانی {faNum(new Date().toLocaleDateString("fa-IR"))}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {error && (
                            <div className="m-5 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-xs">
                                ⚠️ خطا: {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="p-5 space-y-3">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="h-12 rounded skeleton" />
                                ))}
                            </div>
                        ) : sorted.length === 0 ? (
                            <div className="text-center py-20 text-muted text-sm">
                                نمادی در این گروه یافت نشد.
                            </div>
                        ) : (
                            <table className="w-full text-xs">
                                <thead className="bg-surface-2 border-b border-app">
                                    <tr className="text-muted">
                                        <SortHeader label="نماد" sortKey="symbol" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="ارزش بازار (میلیارد ریال)" sortKey="market_cap" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="P/E" sortKey="forward_pe" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="EPS" sortKey="eps" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="حاشیه سود" sortKey="net_margin" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="رشد فروش ماه" sortKey="sales_growth_mom" current={sort} dir={sortDir} onSort={toggleSort} />
                                        <SortHeader label="رشد فروش تجمعی" sortKey="sales_growth_ytd" current={sort} dir={sortDir} onSort={toggleSort} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((row) => (
                                        <tr key={row.symbol} className="border-b border-app hover:bg-surface-2 transition">
                                            <td className="py-3 px-3 text-right">
                                                <Link
                                                    href={`/stocks/${encodeURIComponent(row.symbol)}`}
                                                    className="font-bold text-fg hover:text-brand-600 dark:hover:text-brand-400 transition"
                                                >
                                                    {row.symbol}
                                                </Link>
                                                <div className="text-[10px] text-muted truncate max-w-[140px]">
                                                    {row.name}
                                                </div>
                                            </td>
                                            <td className="py-3 px-3 text-left tabular text-fg">
                                                {faMarketCap(row.market_cap)}
                                            </td>
                                            <td className="py-3 px-3 text-left tabular text-fg">
                                                {row.forward_pe !== null ? faNum(row.forward_pe.toFixed(2)) : "—"}
                                            </td>
                                            <td className="py-3 px-3 text-left tabular text-fg">
                                                {row.eps !== null ? faNum(Math.round(row.eps).toLocaleString("en-US")) : "—"}
                                            </td>
                                            <td
                                                className={`py-3 px-3 text-left tabular ${row.net_margin !== null && row.net_margin > 0
                                                        ? "text-brand-600 dark:text-brand-400"
                                                        : "text-red-600 dark:text-red-400"
                                                    }`}
                                            >
                                                {faPct(row.net_margin)}
                                            </td>
                                            <td
                                                className={`py-3 px-3 text-left tabular ${row.sales_growth_mom !== null && row.sales_growth_mom > 0
                                                        ? "text-brand-600 dark:text-brand-400"
                                                        : row.sales_growth_mom !== null && row.sales_growth_mom < 0
                                                            ? "text-red-600 dark:text-red-400"
                                                            : "text-muted"
                                                    }`}
                                            >
                                                {faPct(row.sales_growth_mom)}
                                            </td>
                                            <td
                                                className={`py-3 px-3 text-left tabular ${row.sales_growth_ytd !== null && row.sales_growth_ytd > 0
                                                        ? "text-brand-600 dark:text-brand-400"
                                                        : row.sales_growth_ytd !== null && row.sales_growth_ytd < 0
                                                            ? "text-red-600 dark:text-red-400"
                                                            : "text-muted"
                                                    }`}
                                            >
                                                {faPct(row.sales_growth_ytd)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

function SortHeader({
    label,
    sortKey,
    current,
    dir,
    onSort,
}: {
    label: string;
    sortKey: SortKey;
    current: SortKey;
    dir: "asc" | "desc";
    onSort: (k: SortKey) => void;
}) {
    const active = current === sortKey;
    return (
        <th className="py-3 px-3 font-medium text-right whitespace-nowrap">
            <button
                onClick={() => onSort(sortKey)}
                className={`inline-flex items-center gap-1 transition ${active ? "text-brand-600 dark:text-brand-400 font-semibold" : "hover:text-fg"
                    }`}
            >
                {label}
                <span className="text-[8px]">{active ? (dir === "asc" ? "▲" : "▼") : "⇅"}</span>
            </button>
        </th>
    );
}
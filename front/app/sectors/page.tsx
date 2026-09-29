"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSectorsList, SectorItem } from "@/lib/api";

function faNum(n: number | string): string {
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

function LockIcon() {
    return (
        <svg
            className="w-3.5 h-3.5 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}

export default function SectorsPage() {
    const [sectors, setSectors] = useState<SectorItem[]>([]);
    const [meta, setMeta] = useState<{ total: number; totalStocks: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchSectorsList()
            .then((res) => {
                setSectors(res.data);
                setMeta({ total: res.meta.total, totalStocks: res.meta.totalStocks });
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    return (
        <main className="flex-1 bg-app">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                {/* Top banner */}
                <div className="rounded-2xl bg-gradient-to-l from-brand-50 to-teal-50 dark:from-brand-500/10 dark:to-teal-500/10 border border-brand-100 dark:border-brand-500/20 p-5 mb-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7h18M3 12h18M3 17h18" />
                        </svg>
                    </div>
                    <p className="text-xs sm:text-sm text-fg leading-6">
                        <span className="font-bold">گروه‌بندی رسمی TSETMC</span>
                        <br />
                        روی هر صنعت کلیک کنید تا نمادهای آن را با متریک‌های کلیدی مقایسه کنید.
                        <br />
                        <span className="text-muted text-[11px]">
                            داده‌ها از TSETMC و کدال به‌روزرسانی می‌شوند.
                        </span>
                    </p>
                </div>

                {/* Panel */}
                <div className="rounded-2xl bg-surface border border-app">
                    <div className="p-5 border-b border-app flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="7" height="7" rx="1" />
                                    <rect x="14" y="3" width="7" height="7" rx="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" />
                                    <rect x="14" y="14" width="7" height="7" rx="1" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-fg">گروه‌های صنعت</h1>
                                <p className="text-[11px] text-muted">
                                    {meta ? `${faNum(meta.total)} گروه · ${faNum(meta.totalStocks)} نماد` : "..."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 sm:p-6">
                        {error && (
                            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-xs">
                                ⚠️ خطا: {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} className="h-28 rounded-2xl skeleton" />
                                ))}
                            </div>
                        ) : sectors.length === 0 ? (
                            <div className="text-center py-20 text-muted text-sm">
                                گروهی یافت نشد. ابتدا یک بار ingest بزنید.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {sectors.map((s) => {
                                    const pe = s.avg_forward_pe;

                                    return (
                                        <Link
                                            key={s.sector}
                                            href={`/sectors/${encodeURIComponent(s.sector)}`}
                                            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-2xl"
                                        >
                                            <div className="relative rounded-2xl border border-app bg-surface px-5 py-4 transition-all duration-200 hover:border-brand-300 dark:hover:border-brand-500/40 hover:-translate-y-0.5 hover:shadow-md">
                                                <h3 className="font-bold text-sm sm:text-base text-fg leading-6 text-center px-4 mb-3">
                                                    {s.sector}
                                                </h3>

                                                <div className="flex items-center justify-between text-[11px] tabular">
                                                    <div className="text-center flex-1">
                                                        <p className="text-muted">تعداد</p>
                                                        <p className="text-fg font-semibold mt-0.5">
                                                            {faNum(s.stock_count)} نماد
                                                        </p>
                                                    </div>

                                                    <div className="w-px h-6 border-l border-app" />

                                                    <div className="text-center flex-1">
                                                        <p className="text-muted">P/E میانگین</p>
                                                        <p className="text-fg font-semibold mt-0.5">
                                                            {pe !== null ? pe.toFixed(1) : "—"}
                                                        </p>
                                                    </div>

                                                    <div className="w-px h-6 border-l border-app" />

                                                    <div className="text-center flex-1">
                                                        <p className="text-muted">اطمینان بالا</p>
                                                        <p className="text-fg font-semibold mt-0.5">
                                                            {faNum(s.high_confidence_count)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {s.top_symbol && (
                                                    <div className="mt-3 pt-3 border-t border-app flex justify-center">
                                                        <span className="text-[10px] text-muted">
                                                            برترین:{" "}
                                                            <span className="text-brand-600 dark:text-brand-400 font-semibold">
                                                                {s.top_symbol}
                                                            </span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
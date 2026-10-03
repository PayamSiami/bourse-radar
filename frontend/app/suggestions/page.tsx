"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSuggestions, SuggestionsResponse } from "@/lib/api";
import SuggestionCard from "@/components/SuggestionCard";
import SuggestionsHeader from "@/components/SuggestionsHeader";

export default function SuggestionsPage() {
    const [data, setData] = useState<SuggestionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            setData(await fetchSuggestions({ topN: 20, minConfidence: "medium" }));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    return (
        <main className="flex-1 bg-app">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
                {/* Header */}
                <div className="rounded-2xl bg-linear-to-l from-brand-50 to-teal-50 dark:from-brand-500/10 dark:to-teal-500/10 border border-brand-100 dark:border-brand-500/20 p-5 mb-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold text-fg">تحلیل هوش مصنوعی</h1>
                        <p className="text-xs text-muted leading-6 mt-1">
                            تحلیل کیفی نمادهای برتر بورس تهران بر اساس متریک‌های عددی و صورت‌های مالی کدال.
                            <br />
                            <span className="text-[11px]">⚠️ این تحلیل‌ها یک برآورد عددی هستند، نه مشاوره سرمایه‌گذاری.</span>
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="hidden sm:inline-flex items-center gap-1 text-xs text-muted hover:text-fg transition px-3 py-1.5 rounded-lg hover:bg-surface-2 shrink-0"
                    >
                        ← بازگشت
                    </Link>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="space-y-4">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="rounded-2xl bg-surface border border-app p-5 space-y-3"
                            >
                                <div className="h-5 w-3/4 rounded skeleton" />
                                <div className="h-3 w-full rounded skeleton" />
                                <div className="h-3 w-full rounded skeleton" />
                                <div className="h-3 w-2/3 rounded skeleton" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
                        <span>⚠️</span>
                        <span>خطا: {error}</span>
                        <button
                            onClick={load}
                            className="mr-auto text-xs underline hover:opacity-80"
                        >
                            تلاش مجدد
                        </button>
                    </div>
                )}

                {/* Data */}
                {data && !loading && (
                    <>
                        <SuggestionsHeader data={data} />

                        <div className="space-y-4 mt-6">
                            {data.data.map((item, i) => (
                                <SuggestionCard key={item.symbol ?? i} item={item} />
                            ))}

                            {data.data.length === 0 && (
                                <div className="text-center py-20 text-muted text-sm">
                                    <div className="text-4xl mb-3 opacity-40">🤖</div>
                                    پیشنهادی یافت نشد. ابتدا یک بار ingest بزنید.
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Mobile back link */}
                <div className="mt-8 sm:hidden text-center">
                    <Link
                        href="/"
                        className="text-xs text-muted hover:text-fg transition"
                    >
                        ← بازگشت به خانه
                    </Link>
                </div>
            </div>
        </main>
    );
}
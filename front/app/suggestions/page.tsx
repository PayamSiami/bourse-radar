"use client";

import { useEffect, useState } from "react";
import { fetchSuggestions, SuggestionsResponse } from "@/lib/api";
import SuggestionCard from "@/components/SuggestionCard";
import SuggestionsHeader from "@/components/SuggestionsHeader";
import Link from "next/link";

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

    useEffect(() => { load(); }, []);

    return (
        <main dir="rtl" className="min-h-screen pb-16">
            <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600
                            flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">
                            🤖
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-tight">
                                تحلیل <span className="text-emerald-500">هوش مصنوعی</span>
                            </h1>
                            <p className="text-[10px] text-zinc-500">تحلیل کیفی نمادهای برتر بورس تهران</p>
                        </div>
                    </div>
                    <Link
                        href="/"
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition px-3 py-1.5 rounded-lg hover:bg-zinc-900"
                    >
                        ← بازگشت
                    </Link>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-6 pt-8">
                {loading && (
                    <div className="space-y-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="rounded-2xl bg-zinc-900/50 border border-zinc-800/80 p-5 space-y-3">
                                <div className="h-5 w-3/4 rounded skeleton" />
                                <div className="h-3 w-full rounded skeleton" />
                                <div className="h-3 w-full rounded skeleton" />
                                <div className="h-3 w-2/3 rounded skeleton" />
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/50 text-red-400 text-sm flex items-center gap-3">
                        <span>⚠️</span>
                        <span>خطا: {error}</span>
                        <button onClick={load} className="mr-auto text-xs underline hover:text-red-300">
                            تلاش مجدد
                        </button>
                    </div>
                )}

                {data && !loading && (
                    <>
                        <SuggestionsHeader data={data} />

                        <div className="space-y-4">
                            {data.data.map((item, i) => (
                                <SuggestionCard key={item.symbol ?? i} item={item} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
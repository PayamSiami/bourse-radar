"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchRankings, RankingItem } from "@/lib/api";
import { num } from "@/lib/format";
import SearchBar, { SortKey } from "@/components/SearchBar";
import StockCard from "@/components/StockCard";
import StockSkeleton from "@/components/StockSkeleton";

function faNum(n: number | string | null | undefined): string {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("fa-IR");
}

export default function StocksPage() {
    const searchParams = useSearchParams();
    const sectorFromUrl = searchParams.get("sector");

    const [items, setItems] = useState<RankingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sort, setSort] = useState<SortKey>("rank");
    const [query, setQuery] = useState("");

    useEffect(() => {
        fetchRankings(200)
            .then((res) => setItems(res.data))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        let list = items;

        if (sectorFromUrl) {
            list = list.filter((s) => s.sector === sectorFromUrl);
        }

        if (query) {
            const q = query.trim();
            list = list.filter((s) => s.symbol.includes(q) || s.name.includes(q));
        }

        return list;
    }, [items, query, sectorFromUrl]);

    const sorted = useMemo(() => {
        const copy = [...filtered];
        const by = (fn: (s: RankingItem) => number | null, dir: 1 | -1 = 1) =>
            (a: RankingItem, b: RankingItem) => {
                const av = fn(a);
                const bv = fn(b);
                if (av === null && bv === null) return 0;
                if (av === null) return 1;
                if (bv === null) return -1;
                return (av - bv) * dir;
            };

        switch (sort) {
            case "score":
                return copy.sort(by((s) => num(s.attractivenessScore), -1));
            case "pe":
                return copy.sort(by((s) => num(s.forwardPe), 1));
            case "change":
                return copy.sort(by((s) => num(s.priceChangePercent), -1));
            case "volume":
                return copy.sort(by((s) => num(s.dailyVolume), -1));
            default:
                return copy.sort(by((s) => num(s.rank), 1));
        }
    }, [filtered, sort]);

    return (
        <main className="flex-1 bg-app">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl font-bold text-fg">
                            {sectorFromUrl ? sectorFromUrl : "همه سهام"}
                        </h1>
                        {sectorFromUrl && (
                            <Link
                                href="/stocks"
                                className="text-[11px] text-muted hover:text-fg transition px-2 py-1 rounded-lg hover:bg-surface-2"
                            >
                                ✕ پاک کردن فیلتر
                            </Link>
                        )}
                    </div>
                    <p className="text-xs text-muted">
                        {loading
                            ? "در حال بارگذاری..."
                            : `${faNum(sorted.length)} نماد` +
                            (sectorFromUrl ? ` در گروه ${sectorFromUrl}` : "")}
                    </p>
                </div>

                {/* Search + sort */}
                <div className="mb-6">
                    <SearchBar
                        onSearch={setQuery}
                        sort={sort}
                        onSort={setSort}
                        loading={loading}
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
                        <span>⚠️</span>
                        <span>خطا: {error}</span>
                    </div>
                )}

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <StockSkeleton key={i} />
                        ))
                        : sorted.map((s) => <StockCard key={s.symbol} stock={s} />)}
                </div>

                {/* Empty state */}
                {!loading && !error && sorted.length === 0 && (
                    <div className="text-center py-24 text-muted">
                        <div className="text-4xl mb-3 opacity-40">🔍</div>
                        <p className="text-sm">
                            {sectorFromUrl
                                ? "نمادی در این گروه یافت نشد"
                                : "نمادی یافت نشد"}
                        </p>
                        {sectorFromUrl && (
                            <Link
                                href="/stocks"
                                className="inline-block mt-4 text-xs text-brand-600 dark:text-brand-400 hover:opacity-80 underline"
                            >
                                نمایش همه سهام
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
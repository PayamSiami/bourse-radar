"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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

// useSearchParams() requires a <Suspense> boundary in Next 16's static
// pre-render, or the build fails with "missing-suspense-with-csr-bailout".
function StocksPageInner() {
    const searchParams = useSearchParams();
    const sectorFromUrl = searchParams.get("sector");

    const [items, setItems] = useState<RankingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sort, setSort] = useState<SortKey>("rank");
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    useEffect(() => {
        fetchRankings(200)
            .then((res) => setItems(res.data))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    // SearchBar debounces its own onSearch to 200ms — mirror it directly.
    useEffect(() => {
        setDebouncedQuery(query);
    }, [query]);

    const filtered = useMemo(() => {
        let list = items;

        if (sectorFromUrl) {
            list = list.filter((s) => s.sector === sectorFromUrl);
        }

        const dq = debouncedQuery.trim();
        if (dq) {
            list = list.filter((s) => s.symbol.includes(dq) || s.name.includes(dq));
        }

        return list;
    }, [items, debouncedQuery, sectorFromUrl]);

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

                {/* Grid — show only the first N and reveal more on demand
                    so mounting 200 heavy StockCards doesn't block first paint. */}
                <WindowedGrid items={sorted} loading={loading} />

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

export default function StocksPage() {
    return (
        <Suspense
            fallback={
                <main className="flex-1 bg-app">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                        <WindowedGrid items={[]} loading />
                    </div>
                </main>
            }
        >
            <StocksPageInner />
        </Suspense>
    );
}

// ──────────────────────────────────────────────────────────
// Progressive list — avoids mounting 200 StockCards at once.
// IntersectionObserver is zero-dep and correctly handles
// flex/grid reflow; falls back to "show all" if unavailable.
// ──────────────────────────────────────────────────────────

function WindowedGrid({
    items,
    loading,
}: {
    items: import("@/lib/api").RankingItem[];
    loading: boolean;
}) {
    const STEP = 24;
    const [visible, setVisible] = useState(STEP);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    // Filter/sort changed -> reset window so new results appear immediately.
    useEffect(() => {
        setVisible(STEP);
    }, [items]);

    useEffect(() => {
        if (loading) return;
        const el = sentinelRef.current;
        if (!el) return;
        if (visible >= items.length) return;

        // SSR-safe: typeof IntersectionObserver avoids a ReferenceError
        // in environments without it (tests, older WebViews).
        if (typeof IntersectionObserver === "undefined") {
            setVisible(items.length);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (first?.isIntersecting) {
                    setVisible((n) => Math.min(n + STEP, items.length));
                }
            },
            { rootMargin: "600px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [items.length, loading, visible]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <StockSkeleton key={i} />
                ))}
            </div>
        );
    }

    const slice = items.slice(0, visible);

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {slice.map((s) => (
                    <StockCard key={s.symbol} stock={s} />
                ))}
            </div>
            {visible < items.length && (
                <div
                    ref={sentinelRef}
                    className="mt-6 flex justify-center"
                    aria-hidden="true"
                >
                    <span className="text-xs text-muted tabular">
                        {visible} / {items.length}
                    </span>
                </div>
            )}
        </>
    );
}
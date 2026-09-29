"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRankings, fetchSectors, RankingItem, SectorSummary } from "@/lib/api";
import { num } from "@/lib/format";
import SearchBar, { SortKey } from "@/components/SearchBar";
import StockCard from "@/components/StockCard";
import StockSkeleton from "@/components/StockSkeleton";
import SectorPanel from "@/components/SectorPanel";
import { StatCard } from "@/components/stat-card";
import { Hero } from "@/components/hero";
import { SalesTrends } from "@/components/sales-trends";

export default function Home() {
  const [items, setItems] = useState<RankingItem[]>([]);
  const [sectors, setSectors] = useState<SectorSummary[]>([]);
  const [meta, setMeta] = useState<{ generatedAt: string; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("rank");
  const [query, setQuery] = useState("");
  const [activeSector, setActiveSector] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [rankings, sectorsRes] = await Promise.all([
        fetchRankings(50),
        fetchSectors().catch(() => ({ data: [], generatedAt: "" })),
      ]);
      setItems(rankings.data);
      setSectors(sectorsRes.data);
      setMeta({ generatedAt: rankings.meta.generatedAt, count: rankings.meta.count });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (query) {
      const q = query.trim();
      list = list.filter((s) => s.symbol.includes(q) || s.name.includes(q));
    }
    if (activeSector) list = list.filter((s) => s.sector === activeSector);
    return list;
  }, [items, query, activeSector]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const by = (fn: (s: RankingItem) => number | null, dir: 1 | -1 = 1) =>
      (a: RankingItem, b: RankingItem) => {
        const av = fn(a), bv = fn(b);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      };
    switch (sort) {
      case "score": return copy.sort(by((s) => num(s.attractivenessScore), -1));
      case "pe": return copy.sort(by((s) => num(s.forwardPe), 1));
      case "change": return copy.sort(by((s) => num(s.priceChangePercent), -1));
      case "volume": return copy.sort(by((s) => num(s.dailyVolume), -1));
      default: return copy.sort(by((s) => num(s.rank), 1));
    }
  }, [filtered, sort]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const scores = filtered.map((s) => num(s.attractivenessScore) ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highConf = filtered.filter((s) => s.confidence === "high").length;
    const gainers = filtered.filter((s) => (num(s.priceChangePercent) ?? 0) > 0).length;
    const losers = filtered.filter((s) => (num(s.priceChangePercent) ?? 0) < 0).length;
    return { avg, highConf, gainers, losers, total: filtered.length };
  }, [filtered]);

  return (
    <main className="flex-1">
      <Hero generatedAt={meta?.generatedAt} total={(meta?.count ?? items.length) || undefined} />

      {/* Stats first — primary signal before supporting charts. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="میانگین امتیاز" value={stats ? `${(stats.avg * 100).toFixed(0)}٪` : "—"} accent="brand" />
          <StatCard label="اطمینان بالا" value={stats ? String(stats.highConf) : "—"} accent="success" />
          <StatCard label="صعودی" value={stats ? String(stats.gainers) : "—"} accent="success" />
          <StatCard label="نزولی" value={stats ? String(stats.losers) : "—"} accent="danger" />
        </div>
      </div>

      {/* ← NEW: Sales Trends section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        <SalesTrends />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-8">
        <SearchBar onSearch={setQuery} sort={sort} onSort={setSort} loading={loading} />
      </div>

      {!loading && sectors.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <SectorPanel sectors={sectors} selected={activeSector} onSelect={setActiveSector} />
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6">
          <div
            role="alert"
            className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-5 flex items-start gap-3"
          >
            <div className="shrink-0 w-8 h-8 rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">
                بارگذاری داده‌ها ناموفق بود
              </h2>
              <p className="text-xs text-red-700 dark:text-red-300/80 leading-6">
                اتصال به سرور برقرار نشد. اگر سرور در حال اجرا نیست، ابتدا آن را راه‌اندازی کنید.
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition"
            >
              تلاش دوباره
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <StockSkeleton key={i} />)
            : sorted.map((s) => <StockCard key={s.symbol} stock={s} />)}
        </div>

        {!loading && !error && sorted.length === 0 && (
          <div className="text-center py-24 text-muted">
            <div className="text-4xl mb-3 opacity-40">📊</div>
            <p className="text-sm">
              {query
                ? `نمادی با عبارت «${query}» یافت نشد`
                : activeSector
                  ? "نمادی در این صنعت یافت نشد"
                  : "هنوز نمادهایی رتبه‌بندی نشده‌اند یا داده کافی برای محاسبه P/E وجود ندارد. دیتای بروزرسانی هر شبانه در دسترس می‌شود."}
            </p>
            {(query || activeSector) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveSector(null);
                }}
                className="mt-4 text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface-2 border border-app hover:border-brand-300 dark:hover:border-brand-500/40 transition"
              >
                پاک کردن فیلترها
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
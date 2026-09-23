"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchRankings, fetchSectors, RankingItem, SectorSummary } from "@/lib/api";
import { num } from "@/lib/format";
import SearchBar, { SortKey } from "@/components/SearchBar";
import StockCard from "@/components/StockCard";
import StockSkeleton from "@/components/StockSkeleton";
import SectorPanel from "@/components/SectorPanel";

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
      setQuery("");
      setActiveSector(null);
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
    if (activeSector) {
      list = list.filter((s) => s.sector === activeSector);
    }
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
    <main dir="rtl" className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600
                            flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">
              📈
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">
                بورس <span className="text-emerald-500">رادار</span>
              </h1>
              <p className="text-[10px] text-zinc-500">ارزیابی جذابیت سهام بورس تهران</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {meta && (
              <div className="hidden md:flex items-center gap-6 text-xs">
                <Stat
                  label="به‌روزرسانی"
                  value={new Date(meta.generatedAt).toLocaleTimeString("fa-IR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                />
                <Stat label="تعداد" value={stats?.total.toString() ?? "—"} />
              </div>
            )}

            <Link
              href="/suggestions"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                         bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400
                         border border-emerald-500/20 text-xs font-semibold transition"
            >
              🤖 <span className="hidden sm:inline">پیشنهادهای AI</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-8">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <HeroStat label="میانگین امتیاز" value={(stats.avg * 100).toFixed(0)} accent="text-emerald-400" />
            <HeroStat label="اطمینان بالا" value={stats.highConf.toString()} accent="text-teal-400" />
            <HeroStat label="صعودی" value={stats.gainers.toString()} accent="text-emerald-400" />
            <HeroStat label="نزولی" value={stats.losers.toString()} accent="text-red-400" />
          </div>
        )}

        <SearchBar onSearch={(q) => setQuery(q)} sort={sort} onSort={setSort} loading={loading} />

        {!loading && sectors.length > 0 && (
          <div className="mt-6">
            <SectorPanel sectors={sectors} selected={activeSector} onSelect={setActiveSector} />
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-900/20 border border-red-800/50 text-red-400 text-sm flex items-center gap-3">
            <span>⚠️</span>
            <span>خطا: {error}</span>
            <button onClick={load} className="mr-auto text-xs underline hover:text-red-300">
              تلاش مجدد
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <StockSkeleton key={i} />)
            : sorted.map((s) => <StockCard key={s.symbol} stock={s} />)}
        </div>

        {!loading && !error && sorted.length === 0 && (
          <div className="text-center py-24 text-zinc-500">
            <div className="text-4xl mb-3 opacity-40">🔍</div>
            <p className="text-sm">
              {activeSector ? "نمادی در این صنعت یافت نشد" : "نمادی یافت نشد"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="text-sm font-bold tabular text-zinc-200">{value}</p>
    </div>
  );
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-zinc-900/50 border border-zinc-800/80 px-4 py-3">
      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold tabular ${accent}`}>{value}</p>
    </div>
  );
}
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchRankings,
  fetchSectors,
  RankingItem,
  SectorSummary,
} from "@/lib/api";
import { num } from "@/lib/format";
import SearchBar, { SortKey } from "@/components/SearchBar";
import StockCard from "@/components/StockCard";
import StockSkeleton from "@/components/StockSkeleton";
import SectorPanel from "@/components/SectorPanel";
import { Hero } from "@/components/hero";
import { SalesTrends } from "@/components/sales-trends";

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function finite(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Number.isFinite(v) ? v : null;
}

// ──────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────

export default function Home() {
  const [items, setItems] = useState<RankingItem[]>([]);
  const [sectors, setSectors] = useState<SectorSummary[]>([]);
  const [sectorsLoaded, setSectorsLoaded] = useState(false);
  const [meta, setMeta] = useState<{
    generatedAt: string;
    count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("rank");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeSector, setActiveSector] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);

    try {
      const rankings = await fetchRankings(50);
      const sectorsRes = await fetchSectors().catch(
        (): { data: SectorSummary[]; generatedAt: string } => ({
          data: [],
          generatedAt: "",
        }),
      );

      if (id !== reqId.current) return;
      setItems(rankings.data);
      setSectors(sectorsRes.data);
      setSectorsLoaded(true);
      setMeta({
        generatedAt: rankings.meta.generatedAt,
        count: rankings.meta.count,
      });
    } catch (e: unknown) {
      if (id !== reqId.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // SearchBar already debounces its own onSearch to 200ms, so no local
  // timer is needed here — just mirror the latest value.
  useEffect(() => {
    setDebouncedQuery(query);
  }, [query]);

  // ── Derived ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = items;
    const q = debouncedQuery.trim();
    if (q) {
      list = list.filter(
        (s) => s.symbol.includes(q) || s.name.includes(q),
      );
    }
    if (activeSector) list = list.filter((s) => s.sector === activeSector);
    return list;
  }, [items, debouncedQuery, activeSector]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const by = (
      fn: (s: RankingItem) => number | null | undefined,
      dir: 1 | -1 = 1,
    ) => (a: RankingItem, b: RankingItem) => {
      const av = finite(fn(a));
      const bv = finite(fn(b));
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

  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    let sum = 0;
    let gainers = 0;
    let losers = 0;
    for (const s of filtered) {
      sum += finite(num(s.attractivenessScore)) ?? 0;
      const ch = finite(num(s.priceChangePercent)) ?? 0;
      if (ch > 0) gainers++;
      else if (ch < 0) losers++;
    }
    return {
      avg: sum / filtered.length,
      gainers,
      losers,
      total: filtered.length,
    };
  }, [filtered]);

  const hasFilters = Boolean(query.trim() || activeSector);

  const clearFilters = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setActiveSector(null);
  }, []);

  return (
    <main className="flex-1">
      {/* ── 1. Hero with inline stats ─────────────────── */}
      <Hero
        generatedAt={loading ? undefined : meta?.generatedAt}
        total={loading ? undefined : (meta?.count ?? items.length)}
        stats={
          loading || !stats
            ? null
            : {
                avgScore: Math.round(stats.avg * 100),
                gainers: stats.gainers,
                losers: stats.losers,
              }
        }
      />

      {/* ── 2. Controls ───────────────────────────────── */}
      <section
        aria-label="جستجو و فیلتر"
        className="mx-auto mt-6 max-w-7xl px-4 sm:px-6"
      >
        <SearchBar
          onSearch={setQuery}
          sort={sort}
          onSort={setSort}
          loading={loading}
        />
        {sectorsLoaded && sectors.length > 0 && (
          <div className="mt-3">
            <SectorPanel
              sectors={sectors}
              selected={activeSector}
              onSelect={setActiveSector}
            />
          </div>
        )}
      </section>

      {/* ── 3. Stock grid (primary content) ───────────── */}
      <section
        aria-label="فهرست سهام"
        aria-live="polite"
        aria-busy={loading}
        className="mx-auto mt-6 max-w-7xl px-4 pb-16 sm:px-6"
      >
        {!error && (
          <HomeGrid items={sorted} loading={loading} />
        )}

        {!loading && !error && sorted.length === 0 && (
          <StatePanel
            tone="empty"
            title={
              debouncedQuery
                ? `نمادی با «${debouncedQuery}» یافت نشد`
                : activeSector
                  ? "نمادی در این صنعت یافت نشد"
                  : "هنوز داده‌ای رتبه‌بندی نشده"
            }
            body={
              debouncedQuery || activeSector
                ? "فیلترها را تغییر دهید یا پاک کنید."
                : "رتبه‌بندی هر شب به‌روزرسانی می‌شود."
            }
            action={
              hasFilters
                ? { label: "پاک کردن فیلترها", onClick: clearFilters }
                : undefined
            }
          />
        )}

        {error && (
          <StatePanel
            tone="error"
            title="بارگذاری داده‌ها ناموفق بود"
            body={error}
            action={{
              label: loading ? "در حال تلاش…" : "تلاش دوباره",
              onClick: load,
              disabled: loading,
            }}
          />
        )}
      </section>

      {/* ── 4. Sales trends (secondary) ───────────────── */}
      <section
        aria-label="روند فروش"
        className="mx-auto max-w-7xl border-t border-app px-4 pt-10 pb-16 sm:px-6"
      >
        <h2 className="mb-4 text-sm font-bold text-fg">روند فروش</h2>
        <SalesTrends />
      </section>
    </main>
  );
}

// ── Windowed homepage list (same idea as /stocks, smaller step) ──
function HomeGrid({
  items,
  loading,
}: {
  items: RankingItem[];
  loading: boolean;
}) {
  const STEP = 18;
  const [visible, setVisible] = useState(STEP);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisible(STEP);
  }, [items]);

  useEffect(() => {
    if (loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (visible >= items.length) return;

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <StockSkeleton key={i} />
        ))}
      </div>
    );
  }

  const slice = items.slice(0, visible);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

// ──────────────────────────────────────────────────────────
// State panel (shared shell for empty + error)
// ──────────────────────────────────────────────────────────

function StatePanel({
  tone,
  title,
  body,
  action,
}: {
  tone: "empty" | "error";
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const palette =
    tone === "error"
      ? {
          wrap:
            "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
          iconWrap:
            "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
          title: "text-red-800 dark:text-red-300",
          body: "text-red-700 dark:text-red-300/80",
          btn: "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50",
          icon: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
        }
      : {
          wrap: "border-app bg-surface-2/40 border-dashed",
          iconWrap: "bg-surface text-muted",
          title: "text-fg",
          body: "text-muted",
          btn: "bg-surface border border-app hover:border-brand-300 dark:hover:border-brand-500/40 text-fg",
          icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
        };

  return (
    <div
      role={tone === "error" ? "status" : undefined}
      aria-live={tone === "error" ? "polite" : undefined}
      className={`flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center ${palette.wrap}`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.iconWrap}`}
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={palette.icon} />
        </svg>
      </div>

      <div className="space-y-1">
        <p className={`text-sm font-bold ${palette.title}`}>{title}</p>
        {body && (
          <p className={`mx-auto max-w-md text-xs leading-6 ${palette.body}`}>
            {body}
          </p>
        )}
      </div>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition ${palette.btn}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
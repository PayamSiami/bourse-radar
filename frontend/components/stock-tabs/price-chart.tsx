"use client";

import { useEffect, useMemo, useState } from "react";
import { PricePoint, fetchPriceHistory } from "@/lib/api";

type Range = 30 | 90 | 180 | 365;

export function PriceChartTab({ symbol }: { symbol: string }) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [days, setDays] = useState<Range>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPriceHistory(symbol, days)
      .then((res) => setPoints(res.points))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [symbol, days]);

  // Compute returns for each range
  const returns = useMemo(() => {
    if (points.length < 2) return {};
    const first = points[0]!.p;
    const last = points[points.length - 1]!.p;
    return { [days]: ((last - first) / first) * 100 };
  }, [points, days]);

  return (
    <div className="rounded-3xl bg-surface border border-app p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-bold text-fg">ارزش بازار — {symbol}</h2>
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-surface-2">
          {([30, 90, 180, 365] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[11px] px-3 py-1.5 rounded-xl transition font-medium ${
                days === d
                  ? "bg-surface text-fg shadow-sm"
                  : "text-muted hover:text-fg"
              }`}
            >
              {d === 30 ? "۱ ماه" : d === 90 ? "۳ ماه" : d === 180 ? "۶ ماه" : "۱ سال"}
            </button>
          ))}
        </div>
      </div>

      {/* Range chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap text-[10px]">
        <RangeChip label="۱ ماهه" value={returns[30]} />
        <RangeChip label="۳ ماهه" value={returns[90]} />
        <RangeChip label="۶ ماهه" value={returns[180]} />
        <RangeChip label="۱ ساله" value={returns[365]} />
      </div>

      {loading ? (
        <div className="h-[400px] rounded-2xl skeleton" />
      ) : points.length < 2 ? (
        <div className="h-[400px] flex items-center justify-center text-muted text-xs">
          داده کافی برای نمودار موجود نیست
        </div>
      ) : (
        <PriceChart points={points} />
      )}
    </div>
  );
}

function RangeChip({ label, value }: { label: string; value: number | undefined }) {
  if (value === undefined) return null;
  const up = value >= 0;
  return (
    <span
      className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${
        up
          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
          : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
      }`}
    >
      {label}: {up ? "+" : ""}{value.toFixed(1)}٪
    </span>
  );
}

function PriceChart({ points }: { points: PricePoint[] }) {
  const width = 1000;
  const height = 420;
  const padding = { top: 30, right: 60, bottom: 40, left: 20 };

  const { path, area, yTicks } = useMemo(() => {
    const prices = points.map((p) => p.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const x = (i: number) => padding.left + (i / (points.length - 1)) * innerW;
    const y = (p: number) => padding.top + innerH - ((p - min) / range) * innerH;

    const line = points
      .map((pt, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(pt.p)}`)
      .join(" ");
    const areaPath = `${line} L${x(points.length - 1)},${height - padding.bottom} L${x(0)},${height - padding.bottom} Z`;

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const p = min + (range * i) / 4;
      return { p, y: y(p) };
    });

    return { path: line, area: areaPath, yTicks: ticks };
  }, [points]);

  return (
    <div className="text-muted">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeDasharray="3 4"
            />
            <text
              x={width - padding.right + 8}
              y={t.y + 4}
              fontSize="11"
              fill="currentColor"
              fillOpacity="0.5"
            >
              {t.p.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#areaGrad)" />
        <path
          d={path}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
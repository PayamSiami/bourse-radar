"use client";

import { useEffect, useMemo, useState } from "react";
import {
  McapPoint,
  McapSeriesResponse,
  fetchMcapSeries,
} from "@/lib/api";

type Range = 30 | 90 | 180 | 365 | 1855;

export function MarketCapTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<McapSeriesResponse | null>(null);
  const [days, setDays] = useState<Range>(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchMcapSeries(symbol, days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [symbol, days]);

  return (
    <div className="rounded-3xl bg-surface border border-app p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-bold text-fg">ارزش بازار — {symbol}</h2>
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-surface-2">
          {([30, 90, 180, 365, 1855] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[11px] px-3 py-1.5 rounded-xl transition font-medium ${
                days === d
                  ? "bg-surface text-fg shadow-sm"
                  : "text-muted hover:text-fg"
              }`}
            >
              {d === 30
                ? "۳۰ روز"
                : d === 90
                  ? "۳ ماه"
                  : d === 180
                    ? "۶ ماه"
                    : d === 365
                      ? "۱ سال"
                      : "۵ سال"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[400px] rounded-2xl skeleton" />
      ) : !data ? (
        <div className="h-[400px] flex items-center justify-center text-muted text-xs">
          داده کافی برای نمودار موجود نیست
        </div>
      ) : (
        <>
          {/* FX attribution */}
          <div className="flex items-center gap-2 mb-3 text-[10px]">
            <span className="px-2 py-1 rounded-lg bg-surface-2 text-muted">
              FX: {data.meta.fxQuality === "valid"
                ? "✓ همه منابع"
                : data.meta.fxQuality === "suspicious"
                  ? "⚠ ناسازگاری"
                  : "↩ یک منبع (Wallex)"}
            </span>
            <span className="px-2 py-1 rounded-lg bg-surface-2 text-muted">
              بازدهی: {data.meta.dataDensity}
            </span>
          </div>

          <McBarChart points={data.points} />

          {/* Latest summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <MiniStat2 label="آخرین قیمت (ریال)" value={data.points[data.points.length - 1]?.priceRial ?? null} rial />
            <MiniStat2 label="ارزش بازار (ریال)" value={data.points[data.points.length - 1]?.mcapRial ?? null} rial />
            <MiniStat2 label="ارزش بازار (USD)" value={data.points[data.points.length - 1]?.mcapUsd ?? null} usd />
            <MiniStat2 label="نرخ ارز (تومان/USD)" value={data.points[data.points.length - 1]?.fxRateToman ?? null} rate />
          </div>
        </>
      )}
    </div>
  );
}

const McBarChart = ({ points }: { points: McapPoint[] }) => {
  const width = 1000;
  const height = 420;
  const padding = { top: 30, right: 60, bottom: 60, left: 80 };

  const { usdBars, maxUsd, scaleY } = useMemo(() => {
    const usdBars = points.map((p) => p.mcapUsd ?? 0);
    const maxUsd = Math.max(...usdBars, 1);
    const innerH = height - padding.top - padding.bottom;
    return {
      usdBars,
      maxUsd,
      scaleY: (v: number) =>
        padding.top + innerH - (v / maxUsd) * innerH,
    };
  }, [points]);

  const innerW = width - padding.left - padding.right;
  const barW = innerW / Math.max(usdBars.length, 1) * 0.6;

  return (
    <div className="text-muted">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y-axis labels (USD millions) */}
        {Array.from({ length: 5 }, (_, i) => {
          const v = (maxUsd / 4) * (4 - i);
          const y = scaleY(v);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeDasharray="3 4"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                fontSize="11"
                fill="currentColor"
                fillOpacity="0.5"
                textAnchor="end"
              >
                ${(v / 1e6).toFixed(0)}M
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {usdBars.map((v, i) => {
          const x = padding.left + (i / usdBars.length) * innerW + 2;
          const y = scaleY(v);
          const barH = height - padding.bottom - y;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={Math.max(barW, 1)}
                height={Math.max(barH, 0)}
                fill="rgb(16 185 129)"
                fillOpacity="0.6"
                rx="2"
              />
              {i % Math.max(1, Math.floor(usdBars.length / 10)) === 0 && (
                <text
                  x={x}
                  y={y - 4}
                  fontSize="9"
                  fill="currentColor"
                  fillOpacity="0.4"
                >
                  {points[i]?.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

function MiniStat2({
  label,
  value,
  rial,
  usd,
  rate,
}: {
  label: string;
  value: number | null;
  rial?: boolean;
  usd?: boolean;
  rate?: boolean;
}) {
  const fmt = (n: number | null) => {
    if (n === null || n === undefined) return "—";
    if (usd) return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    if (rate) return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
    return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
  };
  const unit = usd ? " دلار" : rial ? " ریال" : "";
  return (
    <div className="rounded-2xl bg-surface-2 border border-app p-3 text-center">
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-fg tabular">
        {fmt(value)}
        {unit}
      </p>
    </div>
  );
};

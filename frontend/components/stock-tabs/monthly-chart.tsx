"use client";

import { useEffect, useMemo, useState } from "react";
import { MonthlyChartResponse, fetchMonthlyChart } from "@/lib/api";
import { TabError, TabEmpty } from "@/components/TabStates";

const YEAR_COLORS = [
  { fill: "rgba(20, 184, 166, 0.25)", label: "قدیمی‌تر" },
  { fill: "rgba(20, 184, 166, 0.55)", label: "میانی" },
  { fill: "rgb(13, 148, 136)", label: "جدید" },
];

type Unit = "usd" | "rial";

export function MonthlyChartTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<MonthlyChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("usd");

  const load = () => {
    setLoading(true);
    setError(null);
    fetchMonthlyChart(symbol)
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "خطا در دریافت داده");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [symbol]);

  if (loading) {
    return <div className="h-96 rounded-xl skeleton" />;
  }

  if (error) {
    return <TabError retry={load} />;
  }

  if (!data || data.years.length === 0) {
    return (
      <TabEmpty
        title="فروش ماهانه موجود نیست"
        body="برای این نماد هنوز داده فروش ماهانه‌ای ثبت نشده است. ممکن است در حال بروزرسانی باشد."
      />
    );
  }

  const hasUsd = data.years.some(
    (y) => y.valuesUsd && y.valuesUsd.some((v) => v !== null),
  );

  return (
    <div className="rounded-2xl bg-surface border border-app p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-bold text-fg">فروش کل سه سال اخیر</h2>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="px-2 py-1 rounded-lg bg-surface-2 text-muted">
            {hasUsd ? (unit === "usd" ? "🇺🇸 USD" : "🇮🇷 ریال") : "🇮🇷 میلیون ریال"}
          </span>
          {hasUsd && (
            <div className="flex p-1 rounded-xl bg-surface-2">
              <button
                onClick={() => setUnit("usd")}
                className={`text-[10px] px-2 py-1 rounded-lg ${
                  unit === "usd"
                    ? "bg-surface text-fg shadow"
                    : "text-muted hover:text-fg"
                }`}
              >
                USD
              </button>
              <button
                onClick={() => setUnit("rial")}
                className={`text-[10px] px-2 py-1 rounded-lg ${
                  unit === "rial"
                    ? "bg-surface text-fg shadow"
                    : "text-muted hover:text-fg"
                }`}
              >
                ریال
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[10px] text-muted flex-wrap">
        {data.years.map((y, i) => (
          <div key={y.jy} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{
                background: YEAR_COLORS[i]?.fill ?? YEAR_COLORS[0]!.fill,
              }}
            />
            <span>سال {y.jy}</span>
          </div>
        ))}
        {data.years[0]?.fxQuality && (
          <span className="ml-auto px-2 py-0.5 rounded-lg bg-surface-2 text-muted">
            FX:{" "}
            {data.years[0].fxQuality === "valid"
              ? "✓"
              : data.years[0].fxQuality === "suspicious"
                ? "⚠"
                : "↩"}
          </span>
        )}
      </div>

      <BarChart data={data} unit={unit} />
    </div>
  );
}

function BarChart({ data, unit }: { data: MonthlyChartResponse; unit: Unit }) {
  const width = 900;
  const height = 340;
  const padding = { top: 30, right: 40, bottom: 40, left: 40 };

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { bars, yTicks, avgY } = useMemo(() => {
    const allValues = data.years.flatMap((y) => {
      const vals = unit === "usd" ? y.valuesUsd ?? y.values : y.values;
      return vals.filter((v): v is number => v !== null);
    });
    const max = Math.max(...allValues, 1);

    const fmt = (v: number) => {
      if (unit === "usd") return `$${(v / 1e6).toFixed(1)}M`;
      return v.toLocaleString("fa-IR", { maximumFractionDigits: 0 });
    };

    const y = (v: number) => padding.top + innerH - (v / max) * innerH;

    const monthsCount = 12;
    const groupWidth = innerW / monthsCount;
    const barWidth = groupWidth / (data.years.length + 1);

    const bars: Array<{
      x: number;
      y: number;
      w: number;
      h: number;
      value: number;
      color: string;
    }> = [];

    data.years.forEach((year, yi) => {
      const vals = unit === "usd" ? year.valuesUsd ?? year.values : year.values;
      const color = YEAR_COLORS[yi]?.fill ?? YEAR_COLORS[0]!.fill;
      vals.forEach((v, mi) => {
        if (v === null) return;
        const x = padding.left + mi * groupWidth + yi * barWidth + barWidth * 0.5;
        const barH = (v / max) * innerH;
        bars.push({
          x,
          y: padding.top + innerH - barH,
          w: barWidth * 0.8,
          h: barH,
          value: v,
          color,
        });
      });
    });

    const ticks = Array.from({ length: 5 }, (_, i) => {
      const v = (max * i) / 4;
      return { v, y: y(v), label: fmt(v) };
    });

    const avg =
      allValues.length > 0
        ? allValues.reduce((a, b) => a + b, 0) / allValues.length
        : 0;

    return { bars, yTicks: ticks, avgY: y(avg) };
  }, [data, unit, innerW, innerH]);

  return (
    <div className="text-muted">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid + Y labels */}
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
              x={unit === "usd" ? padding.left - 8 : padding.left - 6}
              y={t.y + 4}
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.5"
              textAnchor="end"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Bars */}
        {bars.map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={b.color}
              rx="2"
            />
          </g>
        ))}

        {/* Average line */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={avgY}
          y2={avgY}
          stroke="rgb(13, 148, 136)"
          strokeWidth="1.5"
          strokeDasharray="6 3"
        />

        {/* X labels */}
        {data.months.map((m, i) => {
          const groupWidth = innerW / data.months.length;
          const x = padding.left + i * groupWidth + groupWidth / 2;
          return (
            <text
              key={i}
              x={x}
              y={height - padding.bottom + 18}
              fontSize="10"
              fill="currentColor"
              fillOpacity="0.6"
              textAnchor="middle"
            >
              {m}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

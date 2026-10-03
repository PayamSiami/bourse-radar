"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  McapPoint,
  McapSeriesResponse,
  fetchMcapSeries,
} from "@/lib/api";

type Range = 30 | 90 | 180 | 365 | 1855;

const RANGES: { value: Range; label: string }[] = [
  { value: 30, label: "۳۰ روز" },
  { value: 90, label: "۳ ماه" },
  { value: 180, label: "۶ ماه" },
  { value: 365, label: "۱ سال" },
  { value: 1855, label: "۵ سال" },
];

type Currency = "usd" | "rial";

const fa = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faCompact = new Intl.NumberFormat("fa-IR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function MarketCapTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<McapSeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Range>(90);
  const [currency, setCurrency] = useState<Currency>("usd");
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);

    fetchMcapSeries(symbol, days)
      .then((d) => {
        if (id !== reqId.current) return; // stale response — drop it
        setData(d);
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setData(null);
        setError(e instanceof Error ? e.message : "خطای شبکه");
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [symbol, days]);

  const latest = data?.points.at(-1);

  return (
    <div className="rounded-2xl border border-app bg-surface">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-fg">
            ارزش بازار
            <span className="ml-2 font-mono text-muted">{symbol}</span>
          </h2>
          {data && (
            <FxBadge
              quality={data.meta.fxQuality}
              density={data.meta.dataDensity}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Currency toggle */}
          <div className="flex items-center rounded-lg border border-app bg-surface-2/60 p-0.5">
            {(["usd", "rial"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${currency === c
                    ? "bg-surface text-fg shadow-sm"
                    : "text-muted hover:text-fg"
                  }`}
              >
                {c === "usd" ? "دلار" : "ریال"}
              </button>
            ))}
          </div>

          {/* Range segmented control */}
          <div className="flex items-center rounded-lg border border-app bg-surface-2/60 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                aria-pressed={days === r.value}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${days === r.value
                    ? "bg-surface text-fg shadow-sm"
                    : "text-muted hover:text-fg"
                  }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="p-5">
        {loading ? (
          <div className="h-[340px] animate-pulse rounded-xl bg-surface-2" />
        ) : error ? (
          <EmptyState
            title="خطا در بارگذاری"
            hint={error}
            tone="error"
          />
        ) : !data || data.points.length === 0 ? (
          <EmptyState
            title="دادهای برای نمایش نیست"
            hint="برای این نماد در بازه انتخابی رکوردی ثبت نشده است."
            tone="neutral"
          />
        ) : (
          <>
            <McapChart
              points={data.points}
              currency={currency}
            />

            {/* ── Summary ───────────────────────────────── */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="آخرین قیمت"
                value={latest?.priceRial ?? null}
                unit="ریال"
              />
              <Stat
                label="ارزش بازار"
                value={latest?.mcapRial ?? null}
                unit="ریال"
              />
              <Stat
                label="ارزش بازار"
                value={latest?.mcapUsd ?? null}
                unit="دلار"
                prefix="$"
              />
              <Stat
                label="نرخ ارز"
                value={latest?.fxRateToman ?? null}
                unit="تومان"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Chart
// ──────────────────────────────────────────────────────────

function McapChart({
  points,
  currency,
}: {
  points: McapPoint[];
  currency: Currency;
}) {
  const dataKey = currency === "usd" ? "mcapUsd" : "mcapRial";

  const rows = useMemo(
    () =>
      points
        .filter((p) => p.date)
        .map((p) => ({
          date: p.date,
          value:
            (currency === "usd" ? p.mcapUsd : p.mcapRial) ?? null,
        }))
        .filter((r) => r.value != null) as { date: string; value: number }[],
    [points, currency],
  );

  const fmtTick = (v: number) =>
    currency === "usd" ? `$${faCompact.format(v)}` : faCompact.format(v);

  const fmtTooltip = (v: number) =>
    currency === "usd"
      ? `$${fa.format(v)}`
      : `${fa.format(v)} ریال`;

  const id = `mcap-${currency}`;

  return (
    <div className="text-fg" style={{ direction: "ltr" }}>
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="2 4"
            stroke="currentColor"
            strokeOpacity={0.08}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            reversed
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(v: string) => v.slice(5)}
          />

          <YAxis
            orientation="right"
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={fmtTick}
            domain={["auto", "auto"]}
          />

          <Tooltip
            cursor={{
              stroke: "currentColor",
              strokeOpacity: 0.2,
              strokeDasharray: "3 3",
            }}
            contentStyle={{
              background: "rgb(var(--surface))",
              border: "1px solid rgb(var(--app))",
              borderRadius: 10,
              fontSize: 11,
              direction: "rtl",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            labelStyle={{ color: "rgb(var(--muted))", fontSize: 10 }}
            formatter={(v) => [fmtTooltip(v as number), "ارزش بازار"]}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Pieces
// ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  unit,
  prefix,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  prefix?: string;
}) {
  const display =
    value == null ? "—" : `${prefix ?? ""}${fa.format(value)}`;
  return (
    <div className="rounded-xl border border-app bg-surface-2/50 px-3 py-2.5">
      <p className="text-[10px] font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
        {display}
        {unit && value != null && (
          <span className="ms-1 text-[10px] font-normal text-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function FxBadge({
  quality,
  density,
}: {
  quality: McapSeriesResponse["meta"]["fxQuality"];
  density: string;
}) {
  const config = {
    valid: { label: "نرخ ارز معتبر", tone: "ok" },
    suspicious: { label: "ناسازگاری نرخ ارز", tone: "warn" },
    fallback: { label: "منبع واحد (Wallex)", tone: "muted" },
  } as const;

  const c = config[quality as keyof typeof config] ?? config.fallback;
  const tone =
    c.tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : c.tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "border-app bg-surface-2 text-muted";

  return (
    <div className="flex items-center gap-1.5">
      <span
        title={c.label}
        className={`rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${tone}`}
      >
        {c.label}
      </span>
      <span className="rounded-md border border-app bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium text-muted">
        {density}
      </span>
    </div>
  );
}

function EmptyState({
  title,
  hint,
  tone,
}: {
  title: string;
  hint?: string;
  tone: "neutral" | "error";
}) {
  return (
    <div className="flex h-85 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-app bg-surface-2/30 text-center">
      <p
        className={`text-xs font-semibold ${tone === "error" ? "text-red-500" : "text-fg"
          }`}
      >
        {title}
      </p>
      {hint && <p className="max-w-xs text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
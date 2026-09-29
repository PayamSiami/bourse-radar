import Link from "next/link";
import { RankingItem } from "@/lib/api";
import { faPrice, faCompact, faPercent, num, scoreTier } from "@/lib/format";

const tier = {
  excellent: {
    bar: "bg-brand-500",
    text: "text-brand-600 dark:text-brand-400",
    ring: "ring-brand-500/30",
    label: "عالی",
  },
  good: {
    bar: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/20",
    label: "خوب",
  },
  fair: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
    label: "متوسط",
  },
  weak: {
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/20",
    label: "ضعیف",
  },
} as const;

const confBadge = {
  high: "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-500/20",
  medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  low: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",
  // "We declined to guess" is not the same as "we tried and it's unreliable" —
  // it reads neutral, not alarming.
  non_calculable: "bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20",
} as const;

const confFa = {
  high: "اطمینان بالا",
  medium: "اطمینان متوسط",
  low: "اطمینان کم",
  non_calculable: "بدون P/E",
} as const;

type Confidence = keyof typeof confFa;

export default function StockCard({ stock }: { stock: RankingItem }) {
  const price = num(stock.currentPrice);
  const change = num(stock.priceChangePercent);
  const pe = num(stock.forwardPe);
  const eps = num(stock.estimatedAnnualEps);
  const score = num(stock.attractivenessScore) ?? 0;
  const volume = num(stock.dailyVolume);
  const t = tier[scoreTier(score)];

  const confKey = (stock.confidence in confBadge
    ? (stock.confidence as Confidence)
    : "non_calculable") as Confidence;

  const changeColor =
    change === null
      ? "text-muted"
      : change > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : change < 0
          ? "text-red-600 dark:text-red-400"
          : "text-muted";

  const peColor =
    pe === null
      ? "text-muted"
      : pe < 5
        ? "text-emerald-600 dark:text-emerald-400"
        : pe < 10
          ? "text-teal-600 dark:text-teal-400"
          : pe < 20
            ? "text-fg"
            : "text-muted";

  return (
    <Link
      href={`/stocks/${encodeURIComponent(stock.symbol)}`}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
    >
      <article
        className={`relative h-full rounded-2xl bg-surface border border-app
                    ring-1 ring-inset ${t.ring} p-5 flex flex-col gap-4
                    transition-all duration-200
                    group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-black/5
                    dark:group-hover:shadow-black/40`}
      >
        {/* Rank pill */}
        <div
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-surface-2 border border-app
                     flex items-center justify-center text-xs font-bold tabular text-muted
                     group-hover:border-brand-500/40 group-hover:text-fg transition"
        >
          {stock.rank}
        </div>

        {/* Header */}
        <header className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-lg leading-tight truncate text-fg">
              {stock.symbol}
            </h3>
            <p className="text-xs text-muted truncate mt-0.5">{stock.name}</p>
            <p className="text-[10px] text-muted/70 mt-1 truncate">{stock.sector}</p>
          </div>
          <span
            className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${confBadge[confKey]}`}
            title={
              confKey === "non_calculable"
                ? "صورت مالی فصلی در دسترس نیست؛ P/E محاسبه نشد"
                : undefined
            }
          >
            {confFa[confKey]}
          </span>
        </header>

        {/* Score bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[10px] text-muted">امتیاز جذابیت</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-[11px] font-semibold ${t.text}`}>
                {t.label}
              </span>
              <span className={`text-lg font-bold tabular ${t.text}`}>
                {(score * 100).toFixed(0)}
              </span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className={`h-full ${t.bar} rounded-full transition-all`}
              style={{ width: `${score * 100}%` }}
            />
          </div>
        </div>

        {/* Price row */}
        <div className="flex justify-between items-end pt-1">
          <div>
            <p className="text-[10px] text-muted mb-0.5">آخرین قیمت</p>
            <p className="text-2xl font-bold tabular leading-none text-fg">
              {price !== null ? faPrice(price) : "—"}
            </p>
            <p className="text-[10px] text-muted/70 mt-1">ریال</p>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-muted mb-0.5">تغییر روز</p>
            <p className={`text-lg font-bold tabular ${changeColor}`}>
              {change !== null ? faPercent(change) : "—"}
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-app text-center">
          <Metric
            label="P/E آینده"
            value={pe !== null ? pe.toFixed(2) : "—"}
            accent={confKey === "non_calculable" ? "text-muted" : peColor}
          />
          <Metric
            label="EPS"
            value={eps !== null ? faPrice(eps) : "—"}
          />
          <Metric
            label="حجم"
            value={volume !== null ? faCompact(volume) : "—"}
          />
        </div>
      </article>
    </Link>
  );
}

function Metric({
  label,
  value,
  accent = "text-fg",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold tabular ${accent}`}>{value}</p>
    </div>
  );
}
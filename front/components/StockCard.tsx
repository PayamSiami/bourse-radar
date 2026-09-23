import Link from "next/link";
import { RankingItem } from "@/lib/api";
import { faPrice, faCompact, faPercent, num, scoreTier } from "@/lib/format";

const tier = {
  excellent: { bar: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/30", label: "عالی" },
  good:      { bar: "bg-teal-500",    text: "text-teal-400",    ring: "ring-teal-500/20",    label: "خوب" },
  fair:      { bar: "bg-yellow-500",  text: "text-yellow-400",  ring: "ring-yellow-500/20",  label: "متوسط" },
  weak:      { bar: "bg-red-500",     text: "text-red-400",     ring: "ring-red-500/20",     label: "ضعیف" },
} as const;

const confBadge = {
  high:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low:    "bg-red-500/10 text-red-400 border-red-500/20",
} as const;

const confFa = { high: "اطمینان بالا", medium: "اطمینان متوسط", low: "اطمینان کم" } as const;

export default function StockCard({ stock }: { stock: RankingItem }) {
  const price = num(stock.currentPrice);
  const change = num(stock.priceChangePercent);
  const pe = num(stock.forwardPe);
  const eps = num(stock.estimatedAnnualEps);
  const score = num(stock.attractivenessScore) ?? 0;
  const volume = num(stock.dailyVolume);
  const t = tier[scoreTier(score)];

  const changeColor =
    change === null ? "text-zinc-500"
    : change > 0 ? "text-emerald-400"
    : change < 0 ? "text-red-400"
    : "text-zinc-400";

  const peColor =
    pe === null ? "text-zinc-500"
    : pe < 5 ? "text-emerald-400"
    : pe < 10 ? "text-teal-400"
    : pe < 20 ? "text-zinc-200"
    : "text-zinc-400";

  return (
    <Link
      href={`/stocks/${encodeURIComponent(stock.symbol)}`}
      className={`group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60`}
    >
      <article
        className={`relative h-full rounded-2xl bg-zinc-900/60 backdrop-blur border border-zinc-800/80
                    ring-1 ring-inset ${t.ring} p-5 flex flex-col gap-4
                    transition-all duration-200
                    group-hover:-translate-y-0.5 group-hover:bg-zinc-900 group-hover:border-zinc-700
                    group-hover:shadow-xl group-hover:shadow-black/40`}
      >
        {/* Rank pill */}
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-zinc-900 border border-zinc-700
                        flex items-center justify-center text-xs font-bold tabular text-zinc-400
                        group-hover:border-zinc-500 group-hover:text-zinc-200 transition">
          {stock.rank}
        </div>

        {/* Header */}
        <header className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-lg leading-tight truncate">{stock.symbol}</h3>
            <p className="text-xs text-zinc-500 truncate mt-0.5">{stock.name}</p>
            <p className="text-[10px] text-zinc-600 mt-1 truncate">{stock.sector}</p>
          </div>
          <span className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${confBadge[stock.confidence]}`}>
            {confFa[stock.confidence]}
          </span>
        </header>

        {/* Score bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[10px] text-zinc-500">امتیاز جذابیت</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-[11px] font-semibold ${t.text}`}>{t.label}</span>
              <span className={`text-lg font-bold tabular ${t.text}`}>{(score * 100).toFixed(0)}</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full ${t.bar} rounded-full`} style={{ width: `${score * 100}%` }} />
          </div>
        </div>

        {/* Price row */}
        <div className="flex justify-between items-end pt-1">
          <div>
            <p className="text-[10px] text-zinc-500 mb-0.5">آخرین قیمت</p>
            <p className="text-2xl font-bold tabular leading-none">
              {price !== null ? faPrice(price) : "—"}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">ریال</p>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-zinc-500 mb-0.5">تغییر روز</p>
            <p className={`text-lg font-bold tabular ${changeColor}`}>
              {change !== null ? faPercent(change) : "—"}
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800/80 text-center">
          <Metric label="P/E آینده" value={pe !== null ? pe.toFixed(2) : "—"} accent={peColor} />
          <Metric label="EPS" value={eps !== null ? faPrice(eps) : "—"} />
          <Metric label="حجم" value={volume !== null ? faCompact(volume) : "—"} />
        </div>
      </article>
    </Link>
  );
}

function Metric({ label, value, accent = "text-zinc-200" }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold tabular ${accent}`}>{value}</p>
    </div>
  );
}
import { Stock } from "@/lib/api";
import { faPrice, scoreTier } from "@/lib/format";

const tierStyle = {
  excellent: { ring: "ring-emerald-500/40", bar: "bg-emerald-500", text: "text-emerald-400", label: "عالی" },
  good:      { ring: "ring-teal-500/30",    bar: "bg-teal-500",    text: "text-teal-400",    label: "خوب" },
  fair:      { ring: "ring-yellow-500/30",  bar: "bg-yellow-500",  text: "text-yellow-400",  label: "متوسط" },
  weak:      { ring: "ring-red-500/30",     bar: "bg-red-500",     text: "text-red-400",     label: "ضعیف" },
} as const;

const confidenceBadge = {
  high:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low:    "bg-red-500/10 text-red-400 border-red-500/20",
} as const;

export default function StockCard({ stock }: { stock: Stock }) {
  const price = Number(stock.last_price);
  const eps = Number(stock.estimated_annual_eps);
  const pe = Number(stock.forward_pe);
  const score = Number(stock.attractiveness_score);
  const volume = Number(stock.volume);
  const tier = scoreTier(score);
  const t = tierStyle[tier];

  return (
    <article
      className={`group relative rounded-2xl bg-zinc-900/50 backdrop-blur border border-zinc-800/80 ring-1 ring-inset ${t.ring}
                  hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-200
                  hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 p-5 flex flex-col gap-4`}
    >
      {/* Rank badge */}
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
          <p className="text-[10px] text-zinc-600 mt-1">{stock.sector}</p>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${confidenceBadge[stock.confidence] ?? confidenceBadge.low}`}>
          اطمینان {stock.confidence === "high" ? "بالا" : stock.confidence === "medium" ? "متوسط" : "کم"}
        </span>
      </header>

      {/* Score bar */}
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[10px] text-zinc-500">امتیاز جذابیت</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-xs font-semibold ${t.text}`}>{t.label}</span>
            <span className={`text-lg font-bold tabular ${t.text}`}>
              {(score * 100).toFixed(0)}
            </span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full ${t.bar} grow-bar rounded-full transition-all`}
            style={{ width: `${score * 100}%` }}
          />
        </div>
      </div>

      {/* Price */}
      <div className="flex justify-between items-end pt-1">
        <div>
          <p className="text-[10px] text-zinc-500 mb-0.5">آخرین قیمت</p>
          <p className="text-2xl font-bold tabular">{faPrice(price)}</p>
        </div>
        <p className="text-[10px] text-zinc-600 tabular">ریال</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800/80 text-center">
        <Metric label="P/E آینده" value={pe.toFixed(2)} accent={pe < 5 ? "text-emerald-400" : pe < 10 ? "text-zinc-300" : "text-zinc-400"} />
        <Metric label="EPS" value={faPrice(eps)} />
        <Metric label="حجم" value={Number(volume).toLocaleString("fa-IR", { notation: "compact", maximumFractionDigits: 1 })} />
      </div>
    </article>
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
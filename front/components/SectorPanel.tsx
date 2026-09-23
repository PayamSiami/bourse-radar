"use client";

import { SectorSummary } from "@/lib/api";
import { num, scoreTier } from "@/lib/format";

const tier = {
  excellent: { bar: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  good:      { bar: "bg-teal-500",    text: "text-teal-400",    ring: "ring-teal-500/20" },
  fair:      { bar: "bg-yellow-500",  text: "text-yellow-400",  ring: "ring-yellow-500/20" },
  weak:      { bar: "bg-red-500",     text: "text-red-400",     ring: "ring-red-500/20" },
} as const;

export default function SectorPanel({
  sectors,
  selected,
  onSelect,
}: {
  sectors: SectorSummary[];
  selected: string | null;
  onSelect: (sector: string | null) => void;
}) {
  if (!sectors.length) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">صنایع</h2>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition"
          >
            پاک کردن فیلتر ✕
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 snap-x snap-mandatory">
        {sectors.map((s) => {
          const score = s.median_score;
          const t = tier[scoreTier(score)];
          const pe = num(s.avg_forward_pe);
          const count = num(s.stock_count);
          const isActive = selected === s.sector;

          return (
            <button
              key={s.sector}
              onClick={() => onSelect(isActive ? null : s.sector)}
              className={`snap-start shrink-0 w-56 text-right rounded-2xl p-4 border transition-all duration-200
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60
                          ${isActive
                            ? `bg-zinc-900 ring-1 ring-inset ${t.ring} border-zinc-700`
                            : "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"}`}
            >
              <p className="text-xs font-semibold text-zinc-200 leading-snug line-clamp-2 min-h-[2rem] mb-2">
                {s.sector}
              </p>

              <div className="flex items-baseline justify-between mb-2">
                <span className={`text-2xl font-bold tabular ${t.text}`}>
                  {(score * 100).toFixed(0)}
                </span>
                <span className="text-[10px] text-zinc-500">امتیاز</span>
              </div>

              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden mb-3">
                <div className={`h-full ${t.bar} rounded-full`} style={{ width: `${score * 100}%` }} />
              </div>

              <div className="flex justify-between text-[10px] tabular">
                <div>
                  <p className="text-zinc-500">P/E میانگین</p>
                  <p className="text-zinc-300 font-semibold">{pe !== null ? pe.toFixed(1) : "—"}</p>
                </div>
                <div className="text-left">
                  <p className="text-zinc-500">تعداد</p>
                  <p className="text-zinc-300 font-semibold">{count ?? "—"}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
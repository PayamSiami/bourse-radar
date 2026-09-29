"use client";

import { SectorSummary } from "@/lib/api";
import { num, scoreTier } from "@/lib/format";

const tier = {
  excellent: {
    bar: "bg-brand-500",
    text: "text-brand-600 dark:text-brand-400",
    ring: "ring-brand-500/30",
  },
  good: {
    bar: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/20",
  },
  fair: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  weak: {
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/20",
  },
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
        <h2 className="text-sm font-semibold text-fg">صنایع</h2>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-[11px] text-muted hover:text-fg transition"
          >
            پاک کردن فیلتر ✕
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x snap-mandatory">
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
              className={`snap-start shrink-0 w-60 text-right rounded-2xl p-4 border transition-all duration-200
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
                          ${isActive
                ? `bg-surface ring-1 ring-inset ${t.ring} border-app shadow-sm`
                : "bg-surface border-app hover:bg-surface-2 hover:-translate-y-0.5"}`}
            >
              <p className="text-xs font-semibold text-fg leading-snug line-clamp-2 min-h-[2.5rem] mb-2">
                {s.sector}
              </p>

              <div className="flex items-baseline justify-between mb-2">
                <span className={`text-xl font-bold tabular ${t.text}`}>
                  {(score * 100).toFixed(0)}
                </span>
                <span className="text-[10px] text-muted">امتیاز</span>
              </div>

              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-3">
                <div
                  className={`h-full ${t.bar} rounded-full transition-all`}
                  style={{ width: `${score * 100}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] tabular">
                <div>
                  <p className="text-muted">P/E میانگین</p>
                  <p className="text-fg font-semibold">
                    {pe !== null ? pe.toFixed(1) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted">تعداد</p>
                  <p className="text-fg font-semibold">{count ?? "—"}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
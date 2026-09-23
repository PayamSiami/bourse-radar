"use client";

import { useState } from "react";

export type SortKey = "rank" | "score" | "pe" | "change" | "volume";

export default function SearchBar({
  onSearch, sort, onSort, loading,
}: {
  onSearch: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState("");

  const sorts: { key: SortKey; label: string }[] = [
    { key: "rank",   label: "رتبه" },
    { key: "score",  label: "امتیاز" },
    { key: "pe",     label: "P/E" },
    { key: "change", label: "تغییر" },
    { key: "volume", label: "حجم" },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full">
      <form
        onSubmit={(e) => { e.preventDefault(); onSearch(q.trim()); }}
        className="relative flex-1"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نماد… (مثلاً فسبزوار)"
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800
                     focus:border-emerald-500/60 focus:bg-zinc-900 focus:outline-none
                     focus:ring-2 focus:ring-emerald-500/20 text-sm transition placeholder:text-zinc-600"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600">
          {loading ? (
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          )}
        </span>
      </form>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/70 border border-zinc-800 overflow-x-auto">
        <span className="text-[10px] text-zinc-500 px-2 shrink-0">مرتب‌سازی</span>
        {sorts.map((s) => (
          <button
            key={s.key}
            onClick={() => onSort(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${
              sort === s.key
                ? "bg-emerald-600/20 text-emerald-400 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
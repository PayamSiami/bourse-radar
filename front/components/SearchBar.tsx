"use client";

import { useState } from "react";

export type SortKey = "rank" | "score" | "pe" | "change" | "volume";

export default function SearchBar({
  onSearch,
  sort,
  onSort,
  loading,
}: {
  onSearch: (q: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState("");

  const sorts: { key: SortKey; label: string }[] = [
    { key: "rank", label: "رتبه" },
    { key: "score", label: "امتیاز" },
    { key: "pe", label: "P/E" },
    { key: "change", label: "تغییر" },
    { key: "volume", label: "حجم" },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full" aria-busy={loading}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q.trim());
        }}
        role="search"
        className="relative flex-1"
      >
        <label htmlFor="stock-search" className="sr-only">
          جستجوی نماد
        </label>
        <input
          id="stock-search"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نماد… (مثلاً فسبزوار)"
          autoComplete="off"
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-surface border border-app
                     focus:border-brand-500/60 focus:outline-none
                     focus:ring-2 focus:ring-brand-500/20 text-sm transition
                     placeholder:text-muted/60 text-fg"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
          {loading ? (
            <LoadingSpinner label="در حال جستجو…" />
          ) : (
            <SearchIcon />
          )}
        </span>
      </form>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-app overflow-x-auto">
        <span className="text-[10px] text-muted px-2 shrink-0">
          مرتب‌سازی
        </span>
        {sorts.map((s) => (
          <button
            key={s.key}
            onClick={() => onSort(s.key)}
            aria-pressed={sort === s.key}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition
                        focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40
                        ${sort === s.key
                ? "bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400 font-semibold"
                : "text-muted hover:text-fg hover:bg-surface-2"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingSpinner({ label }: { label: string }) {
  return (
    <svg
      className="animate-spin w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
    >
      <title>{label}</title>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
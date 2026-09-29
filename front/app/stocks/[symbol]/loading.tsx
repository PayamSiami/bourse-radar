// Conventional Next `loading.tsx` — shown while the Server Component's
// data promise is in-flight. Uses the same card skeleton so the layout
// doesn't jump when real content arrives.

export default function StockPageLoading() {
  return (
    <main className="flex-1 bg-app">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Breadcrumb placeholder */}
        <div className="h-3 w-40 rounded-full skeleton" aria-hidden="true" />

        {/* Header card */}
        <div className="rounded-3xl border border-app bg-surface p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl skeleton shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-40 rounded-full skeleton" />
              <div className="h-3 w-60 rounded-full skeleton" />
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-app bg-surface p-4 space-y-3">
              <div className="h-3 w-20 rounded-full skeleton" />
              <div className="h-7 w-24 rounded-full skeleton" />
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="rounded-3xl border border-app bg-surface p-10 text-center text-muted">
          <div className="text-4xl mb-3 opacity-40" aria-hidden="true">⏳</div>
          <p className="text-xs">در حال دریافت اطلاعات نماد…</p>
        </div>
      </div>
    </main>
  );
}

"use client";

/**
 * Shared states for async tab fetches.
 * Centralising this stops each tab from silently turning a network/backend
 * failure into an "empty data" placeholder (which is misleading and un-actionable).
 */

export function TabError({
  message,
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 p-6 text-center">
      <div className="text-3xl mb-2 opacity-60" aria-hidden="true">🛰</div>
      <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">
        داده دریافت نشد
      </h3>
      <p className="text-xs text-muted leading-6 max-w-md mx-auto mb-4">
        {message ??
          "اتصال به سرور برقرار نشد. ممکن است سرور در حالت degraded باشد یا قفل IP/دیتابیس فعال شده باشد."}
      </p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-surface border border-app text-fg hover:border-brand-300 dark:hover:border-brand-500/40 focus-visible:ring-1 focus-visible:ring-brand-500/40 transition"
        >
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

export function TabEmpty({
  title,
  body,
  icon = "📭",
}: {
  title: string;
  body: string;
  icon?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-app p-10 text-center">
      <div className="text-4xl mb-3 opacity-40" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-fg mb-2">{title}</h3>
      <p className="text-xs text-muted leading-6 max-w-md mx-auto">{body}</p>
    </div>
  );
}

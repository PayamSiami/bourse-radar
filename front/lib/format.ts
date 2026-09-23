/* ---------- Numbers ---------- */

export const faNum = (n: number, opts?: Intl.NumberFormatOptions) =>
  n.toLocaleString("fa-IR", opts);

export const faPrice = (n: number) =>
  n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });

/** Compact for Persian UI: ۹٫۰ میلیارد، ۳٫۵ میلیون، ۱۲ هزار */
export const faCompact = (n: number) =>
  n.toLocaleString("fa-IR", { notation: "compact", maximumFractionDigits: 1 });

/** Latin compact (K/M/B) — kept for cases where you want it */
export const compact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

/** Signed percent, Persian: +۲٫۰۸٪ / -۰٫۷۷٪ */
export const faPercent = (n: number, digits = 2) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}٪`;

/* ---------- Dates ---------- */

export const faDate = (iso: string) =>
  new Date(iso).toLocaleString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const faTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/* ---------- Parsing ---------- */

/**
 * Safe numeric parse. Returns null for null/undefined/""/NaN/Infinity.
 * Use this instead of `Number(v)` so missing data renders as "—".
 */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Domain ---------- */

export const scoreTier = (score: number) => {
  if (score >= 0.8) return "excellent" as const;
  if (score >= 0.65) return "good" as const;
  if (score >= 0.5) return "fair" as const;
  return "weak" as const;
};
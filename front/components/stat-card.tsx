"use client";

const ACCENTS = {
    brand: "text-brand-600 dark:text-brand-500",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
} as const;

export function StatCard({
    label,
    value,
    accent = "brand",
}: {
    label: string;
    value: string | number;
    accent?: keyof typeof ACCENTS;
}) {
    const display = typeof value === "number" ? value.toLocaleString("fa-IR") : value;
    return (
        <div className="card px-4 py-3 shadow-sm">
            <p className="text-[10px] text-muted mb-0.5">{label}</p>
            <p className={`text-xl font-bold tabular ${ACCENTS[accent]}`}>{display}</p>
        </div>
    );
}
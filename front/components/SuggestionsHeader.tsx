import { SuggestionsResponse } from "@/lib/api";

function faNum(n: number | string): string {
    return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

export default function SuggestionsHeader({ data }: { data: SuggestionsResponse }) {
    const fallbackCount = data.data.filter((d) => d.fallback).length;
    const total = data.data.length;
    const ok = total - fallbackCount;

    return (
        <section className="rounded-2xl bg-gradient-to-br from-brand-50 via-surface to-teal-50 dark:from-brand-500/10 dark:via-surface dark:to-teal-500/5 border border-brand-100 dark:border-brand-500/20 p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-brand-600 dark:text-brand-400 mb-1">
                        🤖 پیشنهادهای هوش مصنوعی
                    </h2>
                    <p className="text-xs text-muted leading-relaxed">
                        تحلیل {faNum(total)} نماد برتر بر اساس داده‌های کدال با مدل{" "}
                        <span className="text-fg font-semibold">{data.model}</span>
                    </p>
                </div>

                <div className="flex items-center gap-4 text-xs">
                    <Stat
                        label="تحلیل کامل"
                        value={faNum(ok)}
                        accent="text-brand-600 dark:text-brand-400"
                    />
                    {fallbackCount > 0 && (
                        <Stat
                            label="داده خام"
                            value={faNum(fallbackCount)}
                            accent="text-amber-600 dark:text-amber-400"
                        />
                    )}
                    <Stat
                        label="حداقل اطمینان"
                        value={
                            data.meta.minConfidence === "high"
                                ? "بالا"
                                : data.meta.minConfidence === "medium"
                                    ? "متوسط"
                                    : "کم"
                        }
                    />
                    <Stat
                        label="زمان"
                        value={new Date(data.generatedAt).toLocaleTimeString("fa-IR", {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    />
                </div>
            </div>
        </section>
    );
}

function Stat({
    label,
    value,
    accent = "text-fg",
}: {
    label: string;
    value: string;
    accent?: string;
}) {
    return (
        <div className="text-right">
            <p className="text-[10px] text-muted">{label}</p>
            <p className={`text-sm font-bold tabular ${accent}`}>{value}</p>
        </div>
    );
}
import { SuggestionsResponse } from "@/lib/api";

export default function SuggestionsHeader({ data }: { data: SuggestionsResponse }) {
    const fallbackCount = data.data.filter((d) => d.fallback).length;
    const total = data.data.length;
    const ok = total - fallbackCount;

    return (
        <section className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-zinc-900/40 to-teal-500/5 border border-emerald-500/20 p-5 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-emerald-400 mb-1">
                        🤖 پیشنهادهای هوش مصنوعی
                    </h2>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        تحلیل {total} نماد برتر بر اساس داده‌های کدال با مدل{" "}
                        <span className="text-zinc-200 font-semibold">{data.model}</span>
                    </p>
                </div>

                <div className="flex items-center gap-4 text-xs">
                    <Stat label="تحلیل کامل" value={ok.toString()} accent="text-emerald-400" />
                    {fallbackCount > 0 && (
                        <Stat label="داده خام" value={fallbackCount.toString()} accent="text-amber-400" />
                    )}
                    <Stat
                        label="حداقل اطمینان"
                        value={data.meta.minConfidence === "high" ? "بالا" : data.meta.minConfidence === "medium" ? "متوسط" : "کم"}
                    />
                    <Stat
                        label="زمان"
                        value={new Date(data.generatedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                    />
                </div>
            </div>
        </section>
    );
}

function Stat({ label, value, accent = "text-zinc-200" }: { label: string; value: string; accent?: string }) {
    return (
        <div className="text-right">
            <p className="text-[10px] text-zinc-500">{label}</p>
            <p className={`text-sm font-bold tabular ${accent}`}>{value}</p>
        </div>
    );
}
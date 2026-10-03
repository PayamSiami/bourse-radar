"use client";

export function Hero({
  generatedAt,
  total,
  stats,
}: {
  generatedAt?: string;
  total?: number;
  stats?: { avgScore: number; gainers: number; losers: number } | null;
}) {
  return (
    <section className="brand-gradient pt-16 pb-24">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 text-xs font-medium">
          ✨ دستیار تحلیل بنیادی بورس تهران
        </span>
        <h1 className="text-4xl md:text-5xl font-bold mt-4 text-fg">
          بورس <span className="text-brand-600 dark:text-brand-500">رادار</span>
        </h1>
        <p className="text-lg text-muted mt-4 leading-8 max-w-2xl mx-auto">
          ارزیابی جذابیت سهام بورس تهران بر اساس فروش ماهانه، حاشیه سود واقعی،
          و نسبت P/E آینده‌نگر.
        </p>
        {generatedAt && (
          <p className="text-xs text-muted mt-6">
            آخرین به‌روزرسانی: {new Date(generatedAt).toLocaleString("fa-IR")}
            {total !== undefined && ` · ${total.toLocaleString("fa-IR")} نماد`}
            {stats && ` · میانگین امتیاز ${stats.avgScore} · ${stats.gainers}▲ / ${stats.losers}▼`}
          </p>
        )}
      </div>
    </section>
  );
}
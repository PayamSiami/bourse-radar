// components/footer.tsx
import Image from "next/image";
import Link from "next/link";

const LINKS = [
    { href: "/", label: "خانه" },
    { href: "/stocks", label: "سهام" },
    { href: "/rankings", label: "رتبه‌بندی" },
    { href: "/suggestions", label: "پیشنهادها" },
    { href: "/sectors", label: "صنعت‌ها" },
];

export function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 border-t border-app bg-surface">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Brand */}
                    <div>
                        <div className="flex items-center mb-3 gap-3">
                            <div className="relative w-10 h-10 flex items-center justify-center text-white">
                                <Image
                                    alt="logo"
                                    fill
                                    src={"/logo.webp"}
                                    sizes="10px"
                                />
                            </div>
                            <div>
                                <div className="font-bold text-fg">
                                    بورس <span className="text-brand-600 dark:text-brand-500">رادار</span>
                                </div>
                                <div className="text-[10px] text-muted">ارزیابی جذابیت سهام</div>
                            </div>
                        </div>
                        <p className="text-xs text-muted leading-6 max-w-xs">
                            ارزیابی جذابیت سهام بورس تهران بر اساس فروش ماهانه، حاشیه سود واقعی
                            و نسبت P/E آینده‌نگر.
                        </p>
                    </div>

                    {/* Links */}
                    <div>
                        <h3 className="text-sm font-semibold text-fg mb-3">لینک‌های سریع</h3>
                        <ul className="space-y-2">
                            {LINKS.map((l) => (
                                <li key={l.href}>
                                    <Link
                                        href={l.href}
                                        className="text-xs text-muted hover:text-brand-600 dark:hover:text-brand-400 transition"
                                    >
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Disclaimer */}
                    <div>
                        <h3 className="text-sm font-semibold text-fg mb-3">سلب مسئولیت</h3>
                        <p className="text-xs text-muted leading-6">
                            ⚠️ این وب‌سایت یک ابزار تحلیلی عددی است و هیچ‌گونه سیگنال خرید یا
                            فروش ارائه نمی‌دهد. تمامی محاسبات صرفاً بر اساس داده‌های عمومی کدال
                            و TSETMC انجام شده و ممکن است با واقعیت تفاوت داشته باشد.
                        </p>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-10 pt-6 border-t border-app flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-[11px] text-muted">
                        © {year} بورس رادار — ساخته‌شده با ❤️ برای بازار سرمایه ایران
                    </p>
                    <div className="flex items-center gap-4 text-[11px] text-muted">
                        <a
                            href="https://codal.ir"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-fg transition"
                        >
                            کدال
                        </a>
                        <a
                            href="https://www.tsetmc.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-fg transition"
                        >
                            TSETMC
                        </a>
                        <a
                            href="/docs"
                            className="hover:text-fg transition"
                        >
                            مستندات API
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
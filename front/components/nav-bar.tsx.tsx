"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
    { href: "/", label: "خانه" },
    { href: "/stocks", label: "سهام" },
    { href: "/rankings", label: "رتبه‌بندی" },
    { href: "/suggestions", label: "پیشنهادها" },
    { href: "/sectors", label: "صنعت‌ها" },
];

export function NavBar() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-40 border-b border-app bg-app/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M3 17l6-6 4 4 8-8" />
                        </svg>
                    </div>
                    <div className="leading-tight">
                        <div className="font-bold text-fg">بورس <span className="text-brand-600 dark:text-brand-500">رادار</span></div>
                        <div className="text-[10px] text-muted">ارزیابی جذابیت سهام بورس تهران</div>
                    </div>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    {LINKS.map((l) => {
                        const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
                        return (
                            <Link
                                key={l.href}
                                href={l.href}
                                className={`px-3 py-2 rounded-lg text-sm transition ${active
                                        ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold"
                                        : "text-muted hover:text-fg hover:bg-surface-2"
                                    }`}
                            >
                                {l.label}
                            </Link>
                        );
                    })}
                </nav>

                <ThemeToggle />
            </div>
        </header>
    );
}
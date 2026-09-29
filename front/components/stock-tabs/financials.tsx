"use client";

import { useState } from "react";
import { StockDetail } from "@/lib/api";

const FINANCIAL_ITEMS = [
    { label: "درآمدهای عملیاتی (تجمیعی)", key: "revenue" },
    { label: "درآمد عملیاتی (۳ ماهه)", key: "revenue_q" },
    { label: "حاشیه سود (تجمیعی)", key: "margin_ytd" },
    { label: "حاشیه سود (فصلی)", key: "margin_q" },
    { label: "سایر درآمدها", key: "other_income" },
    { label: "نظر حسابرس", key: "auditor" },
    { label: "نسبت مطالبات به دارایی‌ها", key: "receivables" },
];

export function FinancialsTab({ stock }: { stock: StockDetail }) {
    const [expanded, setExpanded] = useState<string | null>("revenue");

    return (
        <div className="rounded-2xl bg-surface border border-app p-5">
            <h2 className="text-sm font-bold text-fg mb-4">
                اطلاعات صورت‌های مالی
            </h2>

            <div className="space-y-1">
                {FINANCIAL_ITEMS.map((item) => {
                    const isOpen = expanded === item.key;
                    return (
                        <div key={item.key}>
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() => setExpanded(isOpen ? null : item.key)}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs transition ${isOpen
                                        ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400"
                                        : "text-muted hover:bg-surface-2 hover:text-fg"
                                    }`}
                            >
                                <span className="font-semibold">{item.label}</span>
                                <svg
                                    className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    aria-hidden="true"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </button>
                            {isOpen && (
                                <div className="px-4 py-3 text-[11px] text-muted leading-6">
                                    <p>
                                        داده این بخش از صورت‌های مالی فصلی کدال استخراج می‌شود.
                                        {stock.forwardPe?.method && (
                                            <span className="mt-1 block text-[10px] opacity-70">
                                                روش محاسبه P/E: {stock.forwardPe.method === "last3m_annualised"
                                                    ? "سالانه‌سازی ۳ ماه اخیر"
                                                    : stock.forwardPe.method === "unavailable"
                                                    ? "در دسترس نیست"
                                                    : stock.forwardPe.method}
                                            </span>
                                        )}
                                    </p>
                                    {stock.forwardPe?.disclaimer && (
                                        <p className="mt-2 text-[10px] opacity-80">
                                            {stock.forwardPe.disclaimer}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
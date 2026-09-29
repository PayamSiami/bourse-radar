"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/stocks", label: "سهام" },
  { href: "/sectors", label: "صنعت‌ها" },
  { href: "/suggestions", label: "پیشنهادها" },
] as const;

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/stocks?q=${encodeURIComponent(q.trim())}`);
    setMobileOpen(false);
  }

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-app/85 backdrop-blur-xl border-b border-app/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="relative w-9 h-9 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-sm shadow-brand-500/30 transition group-hover:shadow-md group-hover:shadow-brand-500/40">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-app" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[13px] font-bold text-fg leading-tight">
              بورس <span className="text-brand-600 dark:text-brand-400">رادار</span>
            </div>
            <div className="text-[9px] text-muted leading-tight mt-0.5">
              تحلیل بنیادی بورس تهران
            </div>
          </div>
        </Link>

        {/* Search */}
        <form onSubmit={handleSubmit} className="flex-1 max-w-2xl mx-auto relative">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نماد یا نام شرکت..."
            className="w-full h-10 px-4 pr-11 rounded-2xl bg-surface border border-app
                       focus:border-brand-500/60 focus:outline-none
                       focus:ring-4 focus:ring-brand-500/10 text-[13px] text-fg
                       placeholder:text-muted/60 transition
                       hover:border-app/80"
          />

          {/* Search icon (left side, acts as submit) */}
          <button
            type="submit"
            aria-label="جستجو"
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>

          {/* Clear button when text present */}
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              aria-label="پاک کردن"
              className="absolute right-10 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-muted hover:text-fg hover:bg-surface-2 transition"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Keyboard hint */}
          {!q && (
            <kbd className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-app bg-surface-2 text-[9px] font-medium text-muted select-none">
              <span className="text-[11px] leading-none">⌘</span>
              <span>K</span>
            </kbd>
          )}
        </form>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              active={pathname.startsWith(item.href)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle />

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="منو"
            aria-expanded={mobileOpen}
            className="lg:hidden grid h-9 w-9 place-items-center rounded-xl border border-app bg-surface text-muted hover:text-fg hover:bg-surface-2 transition"
          >
            {mobileOpen ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <nav className="lg:hidden border-t border-app bg-app/95 backdrop-blur-xl animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-3 rounded-xl text-sm transition flex items-center justify-between ${active
                      ? "text-brand-600 dark:text-brand-400 font-semibold bg-brand-50 dark:bg-brand-500/10"
                      : "text-muted hover:text-fg hover:bg-surface-2"
                    }`}
                >
                  <span>{item.label}</span>
                  {active && (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-2 rounded-lg text-xs font-medium transition ${active
          ? "text-fg"
          : "text-muted hover:text-fg hover:bg-surface-2"
        }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-brand-500" />
      )}
    </Link>
  );
}
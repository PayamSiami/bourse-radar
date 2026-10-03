import { useState, useEffect } from "react";

/**
 * Client-only (no backend) watchlist. Persisted to localStorage so it survives
 * reloads. A backend-backed version can swap in later without touching the hook's
 * interface.
 */

const STORAGE_KEY = "bourse_watchlist";

function read(): string[] {
  "use client";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as unknown[]).filter(isString) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Returns [isWatched, toggle] — `isWatched` reflects live localStorage state. */
export function useWatchlist(symbol: string): [boolean, () => void] {
  const [isWatched, setIsWatched] = useState(() => read().includes(symbol));

  const toggle = () => {
    const list = read();
    const next = isWatched
      ? list.filter((s) => s !== symbol)
      : Array.from(new Set([...list, symbol]));
    write(next);
    setIsWatched(!isWatched);
  };

  // React to external changes (e.g. another tab's localStorage.write).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIsWatched(read().includes(symbol));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [symbol]);

  return [isWatched, toggle];
}

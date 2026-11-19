"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

export type GifResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

/** @deprecated Use GifResult */
export type TenorGif = GifResult;

type GifPickerProps = {
  onPick: (gif: GifResult) => void;
  className?: string;
};

type CacheEntry = { at: number; results: GifResult[] };

const cache = new Map<string, CacheEntry>();
const CACHE_MS = 2 * 60 * 1000;

export function GifPicker({ onPick, className = "" }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const key = debounced.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setItems(cached.results);
      setError(null);
      setLoading(false);
      return;
    }

    const seq = ++seqRef.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const path = debounced
      ? `/api/gifs?q=${encodeURIComponent(debounced)}&limit=16`
      : "/api/gifs?limit=16";

    void fetch(path, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          results?: GifResult[];
        } | null;
        if (!res.ok) {
          throw new Error(
            body?.error ??
              (res.status === 429
                ? "GIF search hit the free rate limit. Wait a bit and try again."
                : "Could not load GIFs"),
          );
        }
        return body?.results ?? [];
      })
      .then((results) => {
        if (seq !== seqRef.current) return;
        cache.set(key, { at: Date.now(), results });
        setItems(results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (seq !== seqRef.current) return;
        setItems([]);
        const raw =
          err instanceof Error ? err.message : "Could not load GIFs";
        if (/abort/i.test(raw)) return;
        setError(
          /failed to fetch/i.test(raw)
            ? "Could not reach GIF search. Wait a moment and open GIFs again."
            : raw,
        );
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [debounced]);

  return (
    <div
      className={`flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-[#1e1f22] bg-[#2b2d31] shadow-2xl shadow-black/50 ${className}`}
    >
      <div className="border-b border-black/30 p-2">
        <label className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#949ba4]" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search GIFs"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
            autoFocus
          />
        </label>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#949ba4]">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Loading…
          </div>
        )}
        {!loading && error && (
          <p className="px-2 py-8 text-center text-sm text-accent">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-[#949ba4]">
            No GIFs found.
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="columns-2 gap-2">
            {items.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onPick(gif)}
                className="mb-2 block w-full overflow-hidden rounded-md bg-[#1e1f22] break-inside-avoid hover:ring-2 hover:ring-accent/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl}
                  alt=""
                  className="w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

export type TenorGif = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

type GifPickerProps = {
  onPick: (gif: TenorGif) => void;
  className?: string;
};

export function GifPicker({ onPick, className = "" }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const path = debounced
      ? `/api/tenor?q=${encodeURIComponent(debounced)}`
      : "/api/tenor";
    void fetch(path)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Could not load GIFs");
        }
        return (await res.json()) as { results: TenorGif[] };
      })
      .then((data) => {
        if (!cancelled) setItems(data.results ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : "Could not load GIFs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
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
            placeholder="Search Tenor"
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
                  alt={gif.title || "GIF"}
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

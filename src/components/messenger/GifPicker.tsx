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

const PAGE_SIZE = 25;

export function GifPicker({ onPick, className = "" }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function fetchPage(offset: number, append: boolean) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;

    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (debounced) params.set("q", debounced);

    try {
      // Neutral path — ad blockers commonly filter /api/gifs and /api/giphy.
      const res = await fetch(`/api/media-search?${params.toString()}`, {
        signal: controller.signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        results?: GifResult[];
        hasMore?: boolean;
        nextOffset?: number;
      } | null;
      if (!body || typeof body !== "object") {
        throw new Error(
          res.redirected || /\/login/i.test(res.url)
            ? "Sign in required to search GIFs."
            : "Could not load GIFs. If you use an ad blocker, allow this site.",
        );
      }
      if (!res.ok) {
        throw new Error(
          body.error ??
            (res.status === 429
              ? "GIF search hit the free rate limit. Wait a bit and try again."
              : "Could not load GIFs"),
        );
      }
      if (seq !== seqRef.current) return;
      const results = Array.isArray(body?.results) ? body.results : [];
      setItems((prev) => {
        if (!append) return results;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...results.filter((item) => !seen.has(item.id))];
      });
      setHasMore(Boolean(body?.hasMore));
      setNextOffset(
        typeof body?.nextOffset === "number"
          ? body.nextOffset
          : offset + results.length,
      );
      setError(null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (seq !== seqRef.current) return;
      if (!append) setItems([]);
      const raw = err instanceof Error ? err.message : "Could not load GIFs";
      if (/abort/i.test(raw)) return;
      setError(
        /failed to fetch/i.test(raw)
          ? "Could not reach GIF search. If you use an ad blocker, allow this site."
          : raw,
      );
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    setItems([]);
    setHasMore(false);
    setNextOffset(0);
    void fetchPage(0, false);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search changes
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
          <>
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
                    referrerPolicy="no-referrer"
                  />
                </button>
              ))}
            </div>
            {hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void fetchPage(nextOffset, true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#1e1f22] px-3 py-2 text-sm font-medium text-[#dbdee1] hover:bg-[#232428] disabled:opacity-60"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

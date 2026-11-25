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

type GifCategory = {
  id: string;
  label: string;
  /** Empty = trending endpoint; otherwise a search query. */
  query: string;
};

/** Curated like Discord — static list so listing categories doesn't burn API quota. */
const CATEGORIES: GifCategory[] = [
  { id: "trending", label: "Trending", query: "" },
  { id: "celebrate", label: "Celebrate", query: "celebrate" },
  { id: "love", label: "Love", query: "love" },
  { id: "happy", label: "Happy", query: "happy" },
  { id: "sad", label: "Sad", query: "sad" },
  { id: "angry", label: "Angry", query: "angry" },
  { id: "excited", label: "Excited", query: "excited" },
  { id: "dance", label: "Dance", query: "dance" },
  { id: "agree", label: "Agree", query: "agree yes" },
  { id: "no", label: "No", query: "no nope" },
  { id: "shrug", label: "Shrug", query: "shrug" },
  { id: "facepalm", label: "Facepalm", query: "facepalm" },
  { id: "confused", label: "Confused", query: "confused" },
  { id: "awkward", label: "Awkward", query: "awkward" },
  { id: "hungry", label: "Hungry", query: "hungry food" },
  { id: "sleepy", label: "Sleepy", query: "sleepy tired" },
  { id: "wow", label: "Wow", query: "wow mind blown" },
  { id: "lol", label: "LOL", query: "lol laughing" },
];

const PAGE_SIZE = 12;

export function GifPicker({ onPick, className = "" }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState("trending");
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const activeCategory =
    CATEGORIES.find((cat) => cat.id === categoryId) ?? CATEGORIES[0];
  // Typed search wins; otherwise use the selected category query ("" = trending).
  const searchTerm = debounced || activeCategory.query;
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function fetchPage(offset: number, append: boolean) {
    if (!append) {
      abortRef.current?.abort();
    }
    const controller = new AbortController();
    if (!append) abortRef.current = controller;
    const seq = append ? seqRef.current : ++seqRef.current;

    if (append) {
      setLoadingMore(true);
      setMoreError(null);
    } else {
      setLoading(true);
      setError(null);
      setMoreError(null);
    }

    try {
      const res = await fetch("/api/media-search", {
        method: "POST",
        signal: controller.signal,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          q: searchTermRef.current || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
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
            : "Could not load GIFs.",
        );
      }
      if (!res.ok) {
        throw new Error(
          body.error ??
            (res.status === 429
              ? "GIF search hit the free rate limit. Wait a bit and try again."
              : "Could not load GIFs."),
        );
      }
      if (!append && seq !== seqRef.current) return;
      const results = Array.isArray(body.results) ? body.results : [];
      setItems((prev) => {
        if (!append) return results;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...results.filter((item) => !seen.has(item.id))];
      });
      setHasMore(Boolean(body.hasMore));
      setNextOffset(
        typeof body.nextOffset === "number"
          ? body.nextOffset
          : offset + results.length,
      );
      if (append) setMoreError(null);
      else setError(null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      if (!append && seq !== seqRef.current) return;
      const raw = err instanceof Error ? err.message : "Could not load GIFs.";
      if (/abort/i.test(raw)) return;
      const message = /failed to fetch/i.test(raw)
        ? "Could not reach GIF search. Wait a moment and try again."
        : raw;
      if (append) {
        setMoreError(message);
      } else {
        setItems([]);
        setError(message);
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else if (seq === seqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    setItems([]);
    setHasMore(false);
    setNextOffset(0);
    setMoreError(null);
    void fetchPage(0, false);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search/category changes
  }, [searchTerm]);

  function selectCategory(cat: GifCategory) {
    setCategoryId(cat.id);
    setQuery("");
    setDebounced("");
  }

  const showGrid = !loading && items.length > 0;
  const browsingCategories = !debounced;

  return (
    <div
      className={`flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#2b2d31] shadow-2xl shadow-black/50 ring-1 ring-accent/10 ${className}`}
    >
      <div className="border-b border-black/30 p-2">
        <label className="flex items-center gap-2 rounded-md bg-[#1e1f22] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#949ba4]" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) {
                setCategoryId("trending");
              }
            }}
            placeholder="Search GIFs"
            className="min-w-0 flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
            autoFocus
          />
        </label>
        {browsingCategories && (
          <div className="mt-2 -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:thin]">
            {CATEGORIES.map((cat) => {
              const active = cat.id === categoryId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => selectCategory(cat)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "bg-[#1e1f22] text-[#dbdee1] hover:bg-[#232428] hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="max-h-[26rem] overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#949ba4]">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            Loading…
          </div>
        )}
        {!loading && error && items.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-accent">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-[#949ba4]">
            No GIFs found.
          </p>
        )}
        {showGrid && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => onPick(gif)}
                  className="aspect-square overflow-hidden rounded-md bg-[#1e1f22] hover:ring-2 hover:ring-accent/70"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </button>
              ))}
            </div>
            {moreError && (
              <p className="mt-2 px-1 text-center text-xs text-accent">{moreError}</p>
            )}
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
                ) : moreError ? (
                  "Try again"
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

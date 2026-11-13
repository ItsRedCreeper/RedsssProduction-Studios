"use client";

import { useEffect, useState } from "react";

export type VoiceQualityLevel = "excellent" | "good" | "fair" | "poor" | "unknown";

export type VoiceConnectionQuality = {
  level: VoiceQualityLevel;
  label: string;
  latencyMs: number | null;
  colorClass: string;
  tip: string;
};

function classify(latencyMs: number | null): VoiceConnectionQuality {
  if (latencyMs == null || !Number.isFinite(latencyMs)) {
    return {
      level: "unknown",
      label: "Measuring",
      latencyMs: null,
      colorClass: "text-[#949ba4]",
      tip: "Measuring connection…",
    };
  }
  if (latencyMs < 80) {
    return {
      level: "excellent",
      label: "Excellent",
      latencyMs,
      colorClass: "text-[#23a559]",
      tip: `Excellent — ${Math.round(latencyMs)}ms`,
    };
  }
  if (latencyMs < 150) {
    return {
      level: "good",
      label: "Good",
      latencyMs,
      colorClass: "text-[#23a559]",
      tip: `Good — ${Math.round(latencyMs)}ms`,
    };
  }
  if (latencyMs < 250) {
    return {
      level: "fair",
      label: "Fair",
      latencyMs,
      colorClass: "text-[#f0b232]",
      tip: `Fair — ${Math.round(latencyMs)}ms`,
    };
  }
  return {
    level: "poor",
    label: "Poor",
    latencyMs,
    colorClass: "text-accent",
    tip: `Poor — ${Math.round(latencyMs)}ms`,
  };
}

async function pingSupabase() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  const started = performance.now();
  try {
    await fetch(`${base}/rest/v1/`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    return performance.now() - started;
  } catch {
    try {
      const fallbackStart = performance.now();
      await fetch(base, {
        method: "HEAD",
        cache: "no-store",
        mode: "no-cors",
        signal: controller.signal,
      });
      return performance.now() - fallbackStart;
    } catch {
      return null;
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

export function useVoiceConnectionQuality(active: boolean) {
  const [quality, setQuality] = useState<VoiceConnectionQuality>(() =>
    classify(null),
  );

  useEffect(() => {
    if (!active) {
      setQuality(classify(null));
      return;
    }

    let cancelled = false;

    async function sample() {
      const latency = await pingSupabase();
      if (!cancelled) setQuality(classify(latency));
    }

    void sample();
    const id = window.setInterval(() => {
      void sample();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  return quality;
}

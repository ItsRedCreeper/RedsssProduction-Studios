"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type HoverTipSide = "top" | "right" | "bottom" | "left";

type HoverTipProps = {
  label: string | null | undefined;
  side?: HoverTipSide;
  /** Discord-like: show almost immediately. */
  delayMs?: number;
  disabled?: boolean;
  /**
   * Only show when the hovered element (or a nested `.truncate`) is actually
   * ellipsized — for truncated labels like channel / user names.
   */
  onlyIfTruncated?: boolean;
  className?: string;
  children: ReactElement | ReactNode;
};

function elementIsTruncated(el: HTMLElement) {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const nested = el.querySelector<HTMLElement>(".truncate, [data-truncate]");
  if (nested && nested.scrollWidth > nested.clientWidth + 1) return true;
  return false;
}

type TipState = {
  top: number;
  left: number;
  side: HoverTipSide;
};

const GAP = 10;
const EDGE = 8;

function tipTransform(side: HoverTipSide) {
  switch (side) {
    case "right":
      return "translate(0, -50%)";
    case "left":
      return "translate(-100%, -50%)";
    case "bottom":
      return "translate(-50%, 0)";
    case "top":
    default:
      return "translate(-50%, -100%)";
  }
}

function tipArrow(side: HoverTipSide) {
  const base =
    "absolute h-2.5 w-2.5 rotate-45 border-accent/45 bg-[#111214]";
  switch (side) {
    case "right":
      return `${base} left-[-5px] top-1/2 -translate-y-1/2 border-b border-l`;
    case "left":
      return `${base} right-[-5px] top-1/2 -translate-y-1/2 border-t border-r`;
    case "bottom":
      return `${base} left-1/2 top-[-5px] -translate-x-1/2 border-l border-t`;
    case "top":
    default:
      return `${base} bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r`;
  }
}

function preferredPoint(rect: DOMRect, side: HoverTipSide) {
  switch (side) {
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.right + GAP, side };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - GAP, side };
    case "bottom":
      return {
        top: rect.bottom + GAP,
        left: rect.left + rect.width / 2,
        side,
      };
    case "top":
    default:
      return { top: rect.top - GAP, left: rect.left + rect.width / 2, side };
  }
}

/**
 * Fast Discord-style tooltip. Prefer this over native `title` for icon chrome.
 * Keeps the tip inside the viewport (flips / clamps when near edges).
 */
export function HoverTip({
  label,
  side = "top",
  delayMs = 80,
  disabled = false,
  onlyIfTruncated = false,
  className = "",
  children,
}: HoverTipProps) {
  const tipId = useId();
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const preferredSideRef = useRef<HoverTipSide>(side);
  const onlyIfTruncatedRef = useRef(onlyIfTruncated);
  const timerRef = useRef<number | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const clean = label?.trim() || "";

  useEffect(() => {
    onlyIfTruncatedRef.current = onlyIfTruncated;
  }, [onlyIfTruncated]);

  useEffect(() => {
    preferredSideRef.current = side;
  }, [side]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !tipRef.current || !anchorRectRef.current) return;
    const el = tipRef.current;
    const rect = anchorRectRef.current;
    const tipW = el.offsetWidth;
    const tipH = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nextSide = tip.side;
    let point = preferredPoint(rect, nextSide);

    // Flip if the preferred side would clip.
    if (nextSide === "top" && point.top - tipH < EDGE) {
      nextSide = "bottom";
      point = preferredPoint(rect, nextSide);
    } else if (nextSide === "bottom" && point.top + tipH > vh - EDGE) {
      nextSide = "top";
      point = preferredPoint(rect, nextSide);
    } else if (nextSide === "right" && point.left + tipW > vw - EDGE) {
      nextSide = "left";
      point = preferredPoint(rect, nextSide);
    } else if (nextSide === "left" && point.left - tipW < EDGE) {
      nextSide = "right";
      point = preferredPoint(rect, nextSide);
    }

    let { top, left } = point;

    if (nextSide === "top" || nextSide === "bottom") {
      const half = tipW / 2;
      left = Math.min(Math.max(left, EDGE + half), vw - EDGE - half);
      if (nextSide === "top") {
        top = Math.max(top, EDGE + tipH);
      } else {
        top = Math.min(top, vh - EDGE - tipH);
      }
    } else {
      const half = tipH / 2;
      top = Math.min(Math.max(top, EDGE + half), vh - EDGE - half);
      if (nextSide === "right") {
        left = Math.min(left, vw - EDGE - tipW);
      } else {
        left = Math.max(left, EDGE + tipW);
      }
    }

    if (
      tip.top !== top ||
      tip.left !== left ||
      tip.side !== nextSide
    ) {
      setTip({ top, left, side: nextSide });
    }
  }, [tip]);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function hide() {
    clearTimer();
    anchorRectRef.current = null;
    setTip(null);
  }

  function show(element: HTMLElement) {
    if (disabled || !clean) return;
    if (onlyIfTruncatedRef.current && !elementIsTruncated(element)) return;
    clearTimer();
    const rect = element.getBoundingClientRect();
    anchorRectRef.current = rect;
    const next = preferredPoint(rect, preferredSideRef.current);
    if (delayMs <= 0) {
      setTip(next);
      return;
    }
    timerRef.current = window.setTimeout(() => setTip(next), delayMs);
  }

  const child = isValidElement(children) ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      "aria-describedby": tip ? tipId : undefined,
      title: undefined,
      onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
        const prev = (children as ReactElement<Record<string, unknown>>).props
          .onPointerEnter as
          | ((event: React.PointerEvent<HTMLElement>) => void)
          | undefined;
        prev?.(event);
        show(event.currentTarget);
      },
      onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
        const prev = (children as ReactElement<Record<string, unknown>>).props
          .onPointerLeave as
          | ((event: React.PointerEvent<HTMLElement>) => void)
          | undefined;
        prev?.(event);
        hide();
      },
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        const prev = (children as ReactElement<Record<string, unknown>>).props
          .onFocus as
          | ((event: React.FocusEvent<HTMLElement>) => void)
          | undefined;
        prev?.(event);
        show(event.currentTarget);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        const prev = (children as ReactElement<Record<string, unknown>>).props
          .onBlur as
          | ((event: React.FocusEvent<HTMLElement>) => void)
          | undefined;
        prev?.(event);
        hide();
      },
    })
  ) : (
    <span
      className="inline-flex"
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerLeave={hide}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={hide}
    >
      {children}
    </span>
  );

  const portal =
    tip && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{
              top: tip.top,
              left: tip.left,
              transform: tipTransform(tip.side),
            }}
            className="pointer-events-none fixed z-[80] max-w-[min(40rem,calc(100vw-1.25rem))] whitespace-pre-line rounded-md border border-accent/45 bg-[#111214] px-3 py-1 text-sm font-semibold leading-snug text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] [overflow-wrap:anywhere] [text-wrap:pretty]"
          >
            <span className={tipArrow(tip.side)} aria-hidden />
            {clean}
          </span>,
          document.body,
        )
      : null;

  // Avoid wrapping in a layout box unless the caller needs positioning classes
  // (e.g. absolute close buttons). Fragments keep absolute children working.
  if (className) {
    return (
      <span className={className}>
        {child}
        {portal}
      </span>
    );
  }

  return (
    <>
      {child}
      {portal}
    </>
  );
}

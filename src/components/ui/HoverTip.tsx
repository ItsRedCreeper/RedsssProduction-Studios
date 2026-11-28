"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
  /** Tip box top-left in viewport coords (no transform centering). */
  top: number;
  left: number;
  side: HoverTipSide;
  /** Cap width so the tip wraps instead of overflowing the viewport. */
  maxWidth: number;
  /** Caret offset from the tip edge that faces the anchor. */
  arrowOffset: number;
};

const GAP = 10;
const EDGE = 8;
const MAX_TIP = 320;
const TIP_BG = "#111214";
const TIP_BORDER = "#3f4147";
const CARET = 6;

/**
 * Triangle caret sitting flush on the outside of the tip edge, aimed at the
 * anchor. Uses the CSS border triangle (not a rotated square).
 */
function TipCaret({
  side,
  offset,
}: {
  side: HoverTipSide;
  offset: number;
}) {
  // `side` = which side of the anchor the tip sits on.
  // Caret attaches to the opposite edge of the tip and points at the anchor.
  const wrap: CSSProperties =
    side === "top"
      ? { left: offset, top: "100%", transform: "translateX(-50%)" }
      : side === "bottom"
        ? { left: offset, bottom: "100%", transform: "translateX(-50%)" }
        : side === "left"
          ? { top: offset, left: "100%", transform: "translateY(-50%)" }
          : { top: offset, right: "100%", transform: "translateY(-50%)" };

  // Pull 1px back over the tip border so the seam disappears.
  const pull: CSSProperties =
    side === "top"
      ? { marginTop: -1 }
      : side === "bottom"
        ? { marginBottom: -1 }
        : side === "left"
          ? { marginLeft: -1 }
          : { marginRight: -1 };

  const outer: CSSProperties =
    side === "top"
      ? {
          borderLeft: `${CARET}px solid transparent`,
          borderRight: `${CARET}px solid transparent`,
          borderTop: `${CARET}px solid ${TIP_BORDER}`,
        }
      : side === "bottom"
        ? {
            borderLeft: `${CARET}px solid transparent`,
            borderRight: `${CARET}px solid transparent`,
            borderBottom: `${CARET}px solid ${TIP_BORDER}`,
          }
        : side === "left"
          ? {
              borderTop: `${CARET}px solid transparent`,
              borderBottom: `${CARET}px solid transparent`,
              borderLeft: `${CARET}px solid ${TIP_BORDER}`,
            }
          : {
              borderTop: `${CARET}px solid transparent`,
              borderBottom: `${CARET}px solid transparent`,
              borderRight: `${CARET}px solid ${TIP_BORDER}`,
            };

  const inset = CARET - 1;
  const innerShift: CSSProperties =
    side === "top"
      ? { left: 1, top: 0 }
      : side === "bottom"
        ? { left: 1, bottom: 0 }
        : side === "left"
          ? { top: 1, left: 0 }
          : { top: 1, right: 0 };

  const inner: CSSProperties =
    side === "top"
      ? {
          borderLeft: `${inset}px solid transparent`,
          borderRight: `${inset}px solid transparent`,
          borderTop: `${inset}px solid ${TIP_BG}`,
        }
      : side === "bottom"
        ? {
            borderLeft: `${inset}px solid transparent`,
            borderRight: `${inset}px solid transparent`,
            borderBottom: `${inset}px solid ${TIP_BG}`,
          }
        : side === "left"
          ? {
              borderTop: `${inset}px solid transparent`,
              borderBottom: `${inset}px solid transparent`,
              borderLeft: `${inset}px solid ${TIP_BG}`,
            }
          : {
              borderTop: `${inset}px solid transparent`,
              borderBottom: `${inset}px solid transparent`,
              borderRight: `${inset}px solid ${TIP_BG}`,
            };

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{ ...wrap, ...pull }}
    >
      <span className="relative block h-0 w-0" style={outer}>
        <span className="absolute h-0 w-0" style={{ ...innerShift, ...inner }} />
      </span>
    </span>
  );
}

function placeTip(
  rect: DOMRect,
  tipW: number,
  tipH: number,
  preferred: HoverTipSide,
): TipState {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space = {
    top: rect.top - EDGE - GAP,
    bottom: vh - rect.bottom - EDGE - GAP,
    left: rect.left - EDGE - GAP,
    right: vw - rect.right - EDGE - GAP,
  };

  const order: HoverTipSide[] = [preferred];
  const flip: Record<HoverTipSide, HoverTipSide> = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  const ortho: HoverTipSide[] =
    preferred === "top" || preferred === "bottom"
      ? ["right", "left"]
      : ["top", "bottom"];
  order.push(flip[preferred], ...ortho);

  let side = preferred;
  for (const candidate of order) {
    const need =
      candidate === "top" || candidate === "bottom" ? tipH : tipW;
    if (space[candidate] >= need) {
      side = candidate;
      break;
    }
  }

  // Prefer the side with the most room if nothing fully fits.
  if (
    (side === "top" || side === "bottom"
      ? tipH
      : tipW) > space[side]
  ) {
    side = (Object.keys(space) as HoverTipSide[]).sort(
      (a, b) => space[b] - space[a],
    )[0];
  }

  const availableAlong =
    side === "top" || side === "bottom"
      ? vw - EDGE * 2
      : Math.max(80, space[side]);
  const maxWidth = Math.min(MAX_TIP, availableAlong);

  // Re-measure width after maxWidth clamp isn't available here — use tipW
  // capped to maxWidth for placement math.
  const boxW = Math.min(tipW, maxWidth);
  const boxH = tipH;

  let top = 0;
  let left = 0;
  const anchorX = rect.left + rect.width / 2;
  const anchorY = rect.top + rect.height / 2;

  switch (side) {
    case "right":
      left = rect.right + GAP;
      top = anchorY - boxH / 2;
      break;
    case "left":
      left = rect.left - GAP - boxW;
      top = anchorY - boxH / 2;
      break;
    case "bottom":
      top = rect.bottom + GAP;
      left = anchorX - boxW / 2;
      break;
    case "top":
    default:
      top = rect.top - GAP - boxH;
      left = anchorX - boxW / 2;
      break;
  }

  // Slide fully into the viewport — never shrink the box via bad left math.
  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - EDGE - boxW));
  top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - EDGE - boxH));

  let arrowOffset: number;
  if (side === "top" || side === "bottom") {
    arrowOffset = Math.min(
      Math.max(anchorX - left, 10),
      Math.max(10, boxW - 10),
    );
  } else {
    arrowOffset = Math.min(
      Math.max(anchorY - top, 10),
      Math.max(10, boxH - 10),
    );
  }

  return { top, left, side, maxWidth, arrowOffset };
}

/**
 * Fast Discord-style tooltip. Prefer this over native `title` for icon chrome.
 * Keeps the tip inside the viewport (flips / slides when near edges).
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
  const [ready, setReady] = useState(false);
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

    // First paint: measure natural size with a generous max, then place.
    const measured = placeTip(
      rect,
      el.offsetWidth || MAX_TIP,
      el.offsetHeight || 28,
      preferredSideRef.current,
    );

    const changed =
      !ready ||
      tip.top !== measured.top ||
      tip.left !== measured.left ||
      tip.side !== measured.side ||
      tip.maxWidth !== measured.maxWidth ||
      tip.arrowOffset !== measured.arrowOffset;

    if (changed) {
      setTip(measured);
      setReady(true);
    }
  }, [tip, ready]);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function hide() {
    clearTimer();
    anchorRectRef.current = null;
    setReady(false);
    setTip(null);
  }

  function show(element: HTMLElement) {
    if (disabled || !clean) return;
    if (onlyIfTruncatedRef.current && !elementIsTruncated(element)) return;
    clearTimer();
    const rect = element.getBoundingClientRect();
    anchorRectRef.current = rect;
    // Seed with a rough placement; useLayoutEffect measures and corrects.
    const seed = placeTip(rect, MAX_TIP, 28, preferredSideRef.current);
    if (delayMs <= 0) {
      setReady(false);
      setTip(seed);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setReady(false);
      setTip(seed);
    }, delayMs);
  }

  const child = isValidElement(children) ? (
    cloneElement(children as ReactElement<Record<string, unknown>>, {
      // Cursor IDE browser injects data-cursor-ref before hydrate; ignore attr noise.
      suppressHydrationWarning: true,
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
              maxWidth: tip.maxWidth,
              // Hide until measured+placed so we never flash a clipped tip.
              opacity: ready ? 1 : 0,
            }}
            className="pointer-events-none fixed z-[80] whitespace-pre-line rounded-md border border-[#3f4147] bg-[#111214] px-3 py-1.5 text-sm font-medium leading-snug text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)] [overflow-wrap:anywhere] [text-wrap:pretty]"
          >
            <TipCaret side={tip.side} offset={tip.arrowOffset} />
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

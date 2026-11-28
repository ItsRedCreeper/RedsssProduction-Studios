"use client";

import { useEffect, useRef } from "react";
import { pushOverlayEscape } from "@/lib/overlay-escape";

/** Close `onClose` on Escape while `open`, respecting the overlay Escape stack. */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    return pushOverlayEscape(() => onCloseRef.current());
  }, [open]);
}

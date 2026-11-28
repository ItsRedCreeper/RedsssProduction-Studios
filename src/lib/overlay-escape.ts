/**
 * LIFO Escape handling so stacked overlays (notifications → modal → lightbox)
 * close one layer at a time instead of racing multiple window listeners.
 */

type EscapeHandler = () => void;

const stack: EscapeHandler[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top();
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, true);
}

/** Register a close handler while an overlay is open. Returns unregister. */
export function pushOverlayEscape(handler: EscapeHandler) {
  ensureListener();
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

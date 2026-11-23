import { useEffect, useState } from 'react';

/** Exit animations last this long; keep in sync with `--duration-exit` in tokens.css. */
export const EXIT_MS = 150;

/** 0 when motion is reduced, and in jsdom (no matchMedia), so unit tests see an instant close. */
function exitMs(): number {
  if (typeof window.matchMedia !== 'function') return 0;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS;
}

/**
 * Keep the last non-null `value` rendered for one exit animation after it turns null, so an
 * overlay can animate out instead of vanishing. `closing` is true during that time: render the
 * overlay with `data-closing` (exit keyframes) and `inert` (no focus, no clicks).
 */
export function usePresence<T>(value: T | null): { shown: T | null; closing: boolean } {
  const [shown, setShown] = useState<T | null>(value);
  // Adjusting state while rendering is React's documented pattern for "derive from a prop change".
  if (value !== null && value !== shown) setShown(value);
  const instant = value === null && shown !== null && exitMs() === 0;
  if (instant) setShown(null);

  useEffect(() => {
    if (value !== null || shown === null) return;
    const timer = window.setTimeout(() => {
      setShown(null);
    }, EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, shown]);

  if (value !== null) return { shown: value, closing: false };
  return { shown: instant ? null : shown, closing: !instant && shown !== null };
}

/**
 * Give focus back to `previous` when an overlay goes away, unless it has moved on meanwhile: an
 * overlay that animates out unmounts after its exit, when another dialog may already own focus.
 * Focus has not moved while it is on the body or still inside `overlay`.
 */
export function restoreFocus(previous: Element | null, overlay: Element | null | undefined): void {
  const active = document.activeElement;
  const free = active === null || active === document.body || overlay?.contains(active) === true;
  if (free && previous instanceof HTMLElement && previous.isConnected) previous.focus();
}

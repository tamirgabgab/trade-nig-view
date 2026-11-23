import { useEffect, useState } from 'react';

/** Exit animations last this long; keep in sync with `--duration-exit` in tokens.css. */
export const EXIT_MS = 150;

/** 0 when motion is reduced, and in jsdom (no matchMedia), so unit tests see an instant close. */
function exitMs(): number {
  if (typeof window.matchMedia !== 'function') return 0;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS;
}

export type OverlayAttrs = Presence<unknown>['attrs'];

export interface Presence<T> {
  shown: T | null;
  closing: boolean;
  /** Bumped when the value comes back after a close: use it as the overlay's React `key` so a
   *  reopen during the exit starts fresh (state, focus) instead of reviving the closing one. */
  key: number;
  /** Spread on the overlay's root: exit keyframes (`data-closing`) and no focus or clicks. */
  attrs: { 'data-closing': true | undefined; inert: boolean };
}

/**
 * Keep the last non-null `value` rendered for one exit animation after it turns null, so an
 * overlay can animate out instead of vanishing. `closing` is true during that time.
 */
export function usePresence<T>(value: T | null): Presence<T> {
  const [state, setState] = useState({ shown: value, open: value !== null, key: 0 });
  const open = value !== null;
  // Adjusting state while rendering is React's documented pattern for "derive from a prop change";
  // React re-renders at once, so the return below always sees the adjusted state.
  if (open && (value !== state.shown || !state.open)) {
    setState({ shown: value, open: true, key: state.open ? state.key : state.key + 1 });
  } else if (!open && state.open) {
    setState({ shown: exitMs() === 0 ? null : state.shown, open: false, key: state.key });
  }

  useEffect(() => {
    if (open || state.shown === null) return;
    const timer = window.setTimeout(() => {
      setState((s) => (s.open ? s : { ...s, shown: null }));
    }, EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open, state.shown]);

  const closing = !state.open && state.shown !== null;
  return {
    shown: state.shown,
    closing,
    key: state.key,
    attrs: { 'data-closing': closing || undefined, inert: closing },
  };
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

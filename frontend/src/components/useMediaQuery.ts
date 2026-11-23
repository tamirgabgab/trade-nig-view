import { useCallback, useSyncExternalStore } from 'react';

/** Below this width the watchlist floats over the chart instead of taking a column. */
export const NARROW_QUERY = '(max-width: 1099px)';

/** Whether a CSS media query matches, kept live. False where matchMedia is missing (jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
}

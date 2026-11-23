import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (a dragged slider asks the backend once).
 *  Compared by content, so a fresh object with the same fields every render does not restart it. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [settled, setSettled] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(JSON.parse(key) as T);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [key, ms]);
  return settled;
}

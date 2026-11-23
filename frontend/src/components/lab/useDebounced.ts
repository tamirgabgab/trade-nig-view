import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (a dragged slider asks the backend once). */
export function useDebounced<T>(value: T, ms = 200): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
}

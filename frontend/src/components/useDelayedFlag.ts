import { useEffect, useState } from 'react';

/**
 * `flag`, but turning true only after it has stayed true for `delayMs` (turning false at once).
 * Loaders use it so fast responses never flash a spinner.
 */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = window.setTimeout(() => {
      setDelayed(true);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      setDelayed(false);
    };
  }, [flag, delayMs]);
  return flag && delayed;
}

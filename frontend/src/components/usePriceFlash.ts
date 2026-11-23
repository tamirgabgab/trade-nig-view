import { useState } from 'react';

export interface PriceFlash {
  /** Direction of the last change, or null before the first change. */
  direction: 'up' | 'down' | null;
  /** Bumped on every change: use it as the React `key` of the flashing element to restart it. */
  tick: number;
}

/**
 * Green/red flash when a price changes. `identity` names what the price belongs to (symbol,
 * interval); a new identity, or null (e.g. the crosshair is on an older bar), never flashes.
 */
export function usePriceFlash(value: number | null, identity: string | null): PriceFlash {
  const initial: PriceFlash = { direction: null, tick: 0 };
  const [state, setState] = useState({ value, identity, flash: initial });
  if (value !== state.value || identity !== state.identity) {
    const previous = state.value;
    const flash: PriceFlash =
      identity !== null && identity === state.identity && value !== null && previous !== null
        ? { direction: value > previous ? 'up' : 'down', tick: state.flash.tick + 1 }
        : { direction: null, tick: state.flash.tick };
    setState({ value, identity, flash });
    return flash;
  }
  return state.flash;
}

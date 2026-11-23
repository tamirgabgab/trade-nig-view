import { renderHook } from '@testing-library/react';

import { usePriceFlash } from './usePriceFlash.ts';

function setup(value: number | null, identity: string | null) {
  return renderHook(
    (props: { value: number | null; identity: string | null }) =>
      usePriceFlash(props.value, props.identity),
    { initialProps: { value, identity } },
  );
}

describe('usePriceFlash', () => {
  it('flashes up and down on changes of the same price, restarting each time', () => {
    const { result, rerender } = setup(10, 'AAPL');
    expect(result.current).toEqual({ direction: null, tick: 0 });

    rerender({ value: 11, identity: 'AAPL' });
    expect(result.current).toEqual({ direction: 'up', tick: 1 });
    rerender({ value: 10.5, identity: 'AAPL' });
    expect(result.current).toEqual({ direction: 'down', tick: 2 });
    rerender({ value: 10.5, identity: 'AAPL' });
    expect(result.current).toEqual({ direction: 'down', tick: 2 });
  });

  it('does not flash for another symbol, a hidden price or a missing value', () => {
    const { result, rerender } = setup(10, 'AAPL');
    rerender({ value: 300, identity: 'MSFT' });
    expect(result.current.direction).toBeNull();
    rerender({ value: 310, identity: null });
    expect(result.current.direction).toBeNull();
    rerender({ value: null, identity: 'MSFT' });
    expect(result.current.direction).toBeNull();
    rerender({ value: 305, identity: 'MSFT' });
    expect(result.current).toEqual({ direction: null, tick: 0 });
  });
});

import { act, renderHook } from '@testing-library/react';

import { EXIT_MS, usePresence } from './usePresence.ts';

function withMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced })),
  );
}

function setup(initial: string | null) {
  return renderHook((props: { v: string | null }) => usePresence(props.v), {
    initialProps: { v: initial },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('usePresence', () => {
  it('keeps the last value for one exit animation, then drops it', () => {
    withMotion(false);
    vi.useFakeTimers();
    const { result, rerender } = setup('ema');
    expect(result.current).toEqual({ shown: 'ema', closing: false });

    rerender({ v: null });
    expect(result.current).toEqual({ shown: 'ema', closing: true });

    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current).toEqual({ shown: null, closing: false });
  });

  it('switches straight to a new value and reopens during an exit', () => {
    withMotion(false);
    vi.useFakeTimers();
    const { result, rerender } = setup('a');
    rerender({ v: 'b' });
    expect(result.current).toEqual({ shown: 'b', closing: false });
    rerender({ v: null });
    rerender({ v: 'c' });
    expect(result.current).toEqual({ shown: 'c', closing: false });
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current).toEqual({ shown: 'c', closing: false });
  });

  it('closes at once when motion is reduced', () => {
    withMotion(true);
    const { result, rerender } = setup('ema');
    rerender({ v: null });
    expect(result.current).toEqual({ shown: null, closing: false });
  });
});

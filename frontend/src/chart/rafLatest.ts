/**
 * Coalesce rapid updates (e.g. crosshair moves) into at most one call per animation frame, always
 * with the latest value. Keeps the React legend from re-rendering more often than the screen draws.
 */
export interface RafLatest<T> {
  push: (value: T) => void;
  cancel: () => void;
}

export function rafLatest<T>(
  fn: (value: T) => void,
  schedule: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  unschedule: (handle: number) => void = cancelAnimationFrame,
): RafLatest<T> {
  let handle: number | null = null;
  let latest: T;
  return {
    push(value) {
      latest = value;
      handle ??= schedule(() => {
        handle = null;
        fn(latest);
      });
    },
    cancel() {
      if (handle !== null) unschedule(handle);
      handle = null;
    },
  };
}

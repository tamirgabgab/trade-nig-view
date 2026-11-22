import { rafLatest } from './rafLatest.ts';

function fakeFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  return {
    schedule: (cb: FrameRequestCallback) => {
      queue.set(next, cb);
      return next++;
    },
    unschedule: (handle: number) => {
      queue.delete(handle);
    },
    flush: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(0);
    },
    pending: () => queue.size,
  };
}

describe('rafLatest', () => {
  it('delivers only the latest value once per frame', () => {
    const frames = fakeFrames();
    const seen: number[] = [];
    const throttle = rafLatest<number>((v) => seen.push(v), frames.schedule, frames.unschedule);

    throttle.push(1);
    throttle.push(2);
    throttle.push(3);
    expect(frames.pending()).toBe(1);
    frames.flush();
    throttle.push(4);
    frames.flush();

    expect(seen).toEqual([3, 4]);
  });

  it('drops the pending value on cancel', () => {
    const frames = fakeFrames();
    const seen: (number | null)[] = [];
    const throttle = rafLatest<number | null>(
      (v) => seen.push(v),
      frames.schedule,
      frames.unschedule,
    );

    throttle.push(null);
    throttle.cancel();
    frames.flush();

    expect(seen).toEqual([]);
  });
});

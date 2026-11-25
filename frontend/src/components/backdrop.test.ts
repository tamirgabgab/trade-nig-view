import type { Bar } from '../api/bars.ts';
import {
  dayChange,
  ghostCloses,
  ghostPath,
  pulseAlpha,
  PULSE_MAX_ALPHA,
  topoPaths,
} from './backdrop.ts';

const bar = (time: string | number, close: number): Bar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

describe('dayChange', () => {
  it('compares the last daily close with the previous one', () => {
    expect(dayChange([bar('2024-01-02', 100), bar('2024-01-03', 102)], 'UTC')).toBeCloseTo(
      0.02,
      12,
    );
    expect(dayChange([bar('2024-01-03', 102)], 'UTC')).toBeNull();
    expect(dayChange([], 'UTC')).toBeNull();
  });

  it('compares an intraday close with the previous day’s last close, in the display zone', () => {
    const day = (h: number) => Date.UTC(2024, 0, 2, h) / 1000;
    const bars = [
      bar(day(14), 50),
      bar(day(20), 100),
      bar(day(24 + 14), 101),
      bar(day(24 + 15), 103),
    ];
    expect(dayChange(bars, 'UTC')).toBeCloseTo(0.03, 12);
    // In Tokyo (UTC+9) the last bar (15:00 UTC) is already the next day: the day before ends
    // with the 14:00 UTC bar.
    expect(dayChange(bars, 'Asia/Tokyo')).toBeCloseTo(103 / 101 - 1, 12);
  });
});

describe('pulseAlpha', () => {
  it('grows with the move and caps at a 3 % move', () => {
    expect(pulseAlpha(0)).toBe(0);
    expect(pulseAlpha(-0.015)).toBeCloseTo(PULSE_MAX_ALPHA / 2, 12);
    expect(pulseAlpha(0.2)).toBe(PULSE_MAX_ALPHA);
  });
});

describe('topoPaths', () => {
  it('draws the same closed rings for the same seed, inside a padded box', () => {
    const a = topoPaths(1600, 900);
    expect(a).toEqual(topoPaths(1600, 900));
    expect(a.length).toBeGreaterThanOrEqual(4 * 7);
    expect(a.every((d) => d.startsWith('M') && d.endsWith('Z'))).toBe(true);
    expect(topoPaths(1600, 900, 8)).not.toEqual(a);
  });
});

describe('ghostPath', () => {
  it('is an area from the bottom-left to the bottom-right, thinned, highest close at the top', () => {
    const d = ghostPath([1, 10, 100], 100, 50);
    expect(d).toBe('M0,50L0.0,47.5L50.0,28.7L100.0,10.0L100,50Z');
    const long = ghostPath(
      Array.from({ length: 5000 }, (_, i) => 1 + i),
      100,
      50,
      400,
    );
    expect(long.split('L').length).toBeLessThanOrEqual(400 + 3);
    expect(ghostPath([5], 100, 50)).toBe('');
  });
});

describe('ghostCloses', () => {
  it('keeps only the weeks over by the last shown bar, then its own close (no peek in replay)', () => {
    const weeks = [bar('2020-03-02', 10), bar('2020-03-09', 11), bar('2020-03-16', 12)];
    // Wednesday 11 March: the week of 9 March is not over; its Friday close (11) stays hidden.
    expect(ghostCloses(weeks, bar('2020-03-11', 10.5))).toEqual([10, 10.5]);
    // Monday 16 March: the week of 9 March is over.
    expect(ghostCloses(weeks, bar('2020-03-16', 11.8))).toEqual([10, 11, 11.8]);
  });
});

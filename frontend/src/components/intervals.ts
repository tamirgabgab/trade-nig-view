import type { Interval } from '../api/bars.ts';

/** The interval buttons of the top toolbar (and the palette's interval commands). */
export const INTERVALS: { interval: Interval; text: string; label: string }[] = [
  { interval: '1h', text: '1h', label: '1 hour' },
  { interval: '4h', text: '4h', label: '4 hours' },
  { interval: '1D', text: 'D', label: '1 day' },
  { interval: '1W', text: 'W', label: '1 week' },
  { interval: '1M', text: 'M', label: '1 month' },
];

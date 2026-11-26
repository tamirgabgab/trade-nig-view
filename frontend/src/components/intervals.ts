import type { Interval } from '../api/bars.ts';

export interface IntervalOption {
  interval: Interval;
  text: string;
  label: string;
}

/**
 * The minute intervals (the toolbar's minutes menu) with the days of history the provider keeps
 * (Yahoo: 1m 30 days, 5m 60 days; 2m and 10m … 90m are built from them). Older bars exist only
 * where the local cache collected them.
 */
export const MINUTE_INTERVALS: (IntervalOption & { keepsDays: number })[] = [
  { interval: '1m', text: '1m', label: '1 minute', keepsDays: 30 },
  { interval: '2m', text: '2m', label: '2 minutes', keepsDays: 30 },
  { interval: '5m', text: '5m', label: '5 minutes', keepsDays: 60 },
  { interval: '10m', text: '10m', label: '10 minutes', keepsDays: 60 },
  { interval: '15m', text: '15m', label: '15 minutes', keepsDays: 60 },
  { interval: '30m', text: '30m', label: '30 minutes', keepsDays: 60 },
  { interval: '90m', text: '90m', label: '90 minutes', keepsDays: 60 },
];

/** The interval buttons of the top toolbar (and, with the minutes, the palette's commands). */
export const INTERVALS: IntervalOption[] = [
  { interval: '1h', text: '1h', label: '1 hour' },
  { interval: '4h', text: '4h', label: '4 hours' },
  { interval: '1D', text: 'D', label: '1 day' },
  { interval: '1W', text: 'W', label: '1 week' },
  { interval: '1M', text: 'M', label: '1 month' },
];

import { useMemo } from 'react';

import { useChartDataStore } from '../store/chartDataStore.ts';
import { dayEnds } from './calendar.ts';
import { DatePicker } from './DatePicker.tsx';
import { localDate } from './formatClock.ts';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

/** The bottom bar's calendar: pick a day with bars and the chart scrolls to its last bar. */
export function GoToDate() {
  const bars = useChartDataStore((s) => s.data?.bars);
  const focusBar = useChartDataStore((s) => s.focusBar);
  const zone = useDisplayTimeZone();
  const ends = useMemo(() => dayEnds(bars ?? [], zone), [bars, zone]);
  const days = useMemo(() => [...ends.keys()], [ends]);
  const last = bars?.at(-1);
  return (
    <DatePicker
      label="Go to date"
      iconOnly
      days={days}
      value={last === undefined ? undefined : localDate(last.time, zone)}
      onPick={(day) => {
        const bar = bars?.[ends.get(day) ?? -1];
        if (bar !== undefined) focusBar(bar.time);
      }}
    />
  );
}

import { DISPLAY_TIME_ZONE } from '../chart/timeZone.ts';
import styles from './BottomBar.module.css';
import { formatClock } from './formatClock.ts';
import { useNow } from './useNow.ts';

/** Live clock in the bottom bar, in the chart's display time zone (a setting arrives in R6). */
export function Clock() {
  const now = useNow(1000);

  return (
    <time
      className={styles.clock}
      dateTime={now.toISOString()}
      title={`Chart time zone: ${DISPLAY_TIME_ZONE}`}
      aria-live="off"
    >
      {formatClock(now, DISPLAY_TIME_ZONE)}
    </time>
  );
}

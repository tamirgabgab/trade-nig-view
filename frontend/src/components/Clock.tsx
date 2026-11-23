import styles from './BottomBar.module.css';
import { formatClock } from './formatClock.ts';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';
import { useNow } from './useNow.ts';

/** Live clock in the bottom bar, in the chart's display time zone (chart settings). */
export function Clock() {
  const now = useNow(1000);
  const zone = useDisplayTimeZone();

  return (
    <time
      className={styles.clock}
      dateTime={now.toISOString()}
      title={`Chart time zone: ${zone}`}
      aria-live="off"
    >
      {formatClock(now, zone)}
    </time>
  );
}

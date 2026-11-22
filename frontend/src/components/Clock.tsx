import { useEffect, useState } from 'react';

import { DISPLAY_TIME_ZONE } from '../chart/timeZone.ts';
import styles from './BottomBar.module.css';
import { formatClock } from './formatClock.ts';

/** Live clock in the bottom bar, in the chart's display time zone (a setting arrives in R6). */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

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

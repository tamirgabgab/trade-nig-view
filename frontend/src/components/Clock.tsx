import { useEffect, useState } from 'react';

import styles from './BottomBar.module.css';
import { formatUtcClock } from './formatUtcClock.ts';

/** Live clock in the bottom bar. Time-zone selection arrives in R6. */
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
    <time className={styles.clock} dateTime={now.toISOString()} aria-live="off">
      {formatUtcClock(now)}
    </time>
  );
}

import { ChartCandlestick } from 'lucide-react';

import styles from './ChartArea.module.css';

interface ChartAreaProps {
  className?: string | undefined;
}

/** Placeholder for the chart. ChartEngine (lightweight-charts v5) mounts here in R2. */
export function ChartArea({ className }: ChartAreaProps) {
  return (
    <main className={[styles.area, className].join(' ')} aria-label="Chart">
      <div className={styles.legend}>
        <span className={styles.title}>Apple Inc. · 1D · NASDAQ</span>
        <span className={styles.muted}>O — H — L — C —</span>
      </div>
      <div className={styles.empty}>
        <ChartCandlestick size={40} strokeWidth={1.25} aria-hidden="true" />
        <p className={styles.emptyTitle}>No chart yet</p>
        <p className={styles.emptyText}>
          The candlestick chart arrives in R2. Market data is already live: see the watchlist on
          the right.
        </p>
      </div>
    </main>
  );
}

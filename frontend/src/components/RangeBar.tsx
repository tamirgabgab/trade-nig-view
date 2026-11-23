import { formatPrice } from './formatNumber.ts';
import styles from './SymbolCard.module.css';

/** A low–high range as a bar with a marker at `value` (day range, 52-week range). */
export function RangeBar({
  label,
  low,
  high,
  value,
  decimals,
}: {
  label: string;
  low: number | null;
  high: number | null;
  value: number;
  decimals: number;
}) {
  if (low === null || high === null) return null;
  const at = high > low ? Math.min(Math.max((value - low) / (high - low), 0), 1) : 0.5;
  return (
    <div className={styles.range}>
      <span className={styles.rangeHead}>{label}</span>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.marker} style={{ left: `${String(at * 100)}%` }} />
      </div>
      <div className={styles.rangeEnds}>
        <span>{formatPrice(low, decimals)}</span>
        <span>{formatPrice(high, decimals)}</span>
      </div>
    </div>
  );
}

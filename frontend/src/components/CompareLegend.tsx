import { X } from 'lucide-react';

import type { Bar } from '../api/bars.ts';
import { readChartTheme } from '../chart/theme.ts';
import { useChartStore } from '../store/chartStore.ts';
import styles from './CompareLegend.module.css';
import { formatPrice } from './formatNumber.ts';

/**
 * The compared symbols under the price legend: each line's colour, its close at the hovered bar
 * (or the last one) and a button to remove it.
 */
export function CompareLegend({
  compare,
  time,
}: {
  compare: readonly { symbol: string; display: string; bars: readonly Bar[]; decimals: number }[];
  /** The hovered (or last) bar's time on the chart. */
  time: Bar['time'] | undefined;
}) {
  const removeCompare = useChartStore((s) => s.removeCompare);
  if (compare.length === 0) return null;
  const theme = readChartTheme();
  const colors = [theme.compare1, theme.compare2, theme.compare3];
  return (
    <ul className={styles.legend} aria-label="Compared symbols">
      {compare.map(({ symbol, display, bars, decimals }, i) => {
        // The same bar as the chart's (in replay never a later one).
        const bar = time === undefined ? undefined : bars.find((b) => b.time === time);
        return (
          <li key={symbol} className={styles.row}>
            <span className={styles.swatch} style={{ background: colors[i % 3] }} />
            <span className={styles.symbol}>{display}</span>
            <span className={styles.value}>
              {bar === undefined ? '—' : formatPrice(bar.close, decimals)}
            </span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${display} from the comparison`}
              title={`Remove ${display}`}
              onClick={() => {
                removeCompare(symbol);
              }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

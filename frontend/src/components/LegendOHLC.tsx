import type { Interval } from '../api/bars.ts';
import {
  direction,
  formatPercent,
  formatPrice,
  formatSigned,
  formatVolume,
} from './formatNumber.ts';
import styles from './LegendOHLC.module.css';
import type { LegendValues } from './legendValues.ts';

interface LegendOHLCProps {
  title: string;
  interval: Interval;
  exchange: string;
  values: LegendValues | null;
  decimals: number;
  hasVolume: boolean;
  /** Short status next to the title, e.g. "Loading NVDA…" or "Cached data". */
  status?: string | undefined;
}

function Field({ name, value, tone }: { name: string; value: string; tone: string }) {
  return (
    <span className={styles.field}>
      <span className={styles.name}>{name}</span>
      <span className={tone} data-field={name}>
        {value}
      </span>
    </span>
  );
}

/** Top-left chart legend: symbol, interval, exchange and the OHLC of the bar under the crosshair. */
export function LegendOHLC({
  title,
  interval,
  exchange,
  values,
  decimals,
  hasVolume,
  status,
}: LegendOHLCProps) {
  const tone = styles[direction(values?.change ?? null)] ?? '';
  return (
    <div className={styles.legend} aria-label="Price legend">
      <div className={styles.row}>
        <span className={styles.title}>
          {[title, interval, exchange].filter(Boolean).join(' · ')}
        </span>
        {values && (
          <>
            <Field name="O" value={formatPrice(values.open, decimals)} tone={tone} />
            <Field name="H" value={formatPrice(values.high, decimals)} tone={tone} />
            <Field name="L" value={formatPrice(values.low, decimals)} tone={tone} />
            <Field name="C" value={formatPrice(values.close, decimals)} tone={tone} />
            {values.change !== null && values.changePct !== null && (
              <span className={tone} data-field="change">
                {formatSigned(values.change, decimals)} ({values.changePct > 0 ? '+' : ''}
                {formatPercent(values.changePct)})
              </span>
            )}
          </>
        )}
        {status && (
          <span className={styles.status} role="status">
            {status}
          </span>
        )}
      </div>
      {values && hasVolume && (
        <div className={styles.row}>
          <Field name="Vol" value={formatVolume(values.volume)} tone={tone} />
        </div>
      )}
    </div>
  );
}

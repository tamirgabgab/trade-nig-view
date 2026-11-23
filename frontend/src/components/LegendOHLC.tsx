import type { ReactNode } from 'react';

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
import { usePriceFlash, type PriceFlash } from './usePriceFlash.ts';

interface LegendOHLCProps {
  title: string;
  interval: Interval;
  exchange: string;
  values: LegendValues | null;
  decimals: number;
  hasVolume: boolean;
  /** Short status next to the title, e.g. "Loading NVDA…" or "Cached data". */
  status?: string | undefined;
  /** Rows below the price (indicator legend). */
  children?: ReactNode;
  /**
   * What the latest close belongs to (symbol, interval, adjustment, chart type) while the legend
   * shows the latest bar; null while the crosshair is on an older bar. A change of the close under
   * the same key flashes it green or red.
   */
  flashKey?: string | null;
}

function Field({
  name,
  value,
  tone,
  flash,
}: {
  name: string;
  value: string;
  tone: string;
  flash?: PriceFlash;
}) {
  return (
    <span className={styles.field}>
      <span className={styles.name}>{name}</span>
      <span
        key={flash?.tick}
        className={tone}
        data-field={name}
        data-flash={flash?.direction ?? undefined}
      >
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
  children,
  flashKey = null,
}: LegendOHLCProps) {
  const flash = usePriceFlash(values?.close ?? null, flashKey);
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
            <Field name="C" value={formatPrice(values.close, decimals)} tone={tone} flash={flash} />
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
      {children}
    </div>
  );
}

import { DISPLAY_TIME_ZONE } from '../chart/timeZone.ts';
import { useChartDataStore } from '../store/chartDataStore.ts';
import styles from './DataWindow.module.css';
import { formatBarTime } from './formatClock.ts';
import { formatChange, formatPrice, formatVolume } from './formatNumber.ts';
import { legendValues } from './legendValues.ts';

/** Every value of the bar under the crosshair (the last bar when it is off the chart). */
export function DataWindow() {
  const data = useChartDataStore((s) => s.data);
  const hoverIndex = useChartDataStore((s) => s.hoverIndex);
  const values = data === null ? null : legendValues(data.bars, hoverIndex);
  if (data === null || values === null) {
    return <p className={styles.empty}>No bars loaded.</p>;
  }
  const index =
    hoverIndex !== null && hoverIndex < data.bars.length ? hoverIndex : data.bars.length - 1;
  const price = (v: number) => formatPrice(v, data.decimals);
  const rows: [string, string][] = [
    ['Open', price(values.open)],
    ['High', price(values.high)],
    ['Low', price(values.low)],
    ['Close', price(values.close)],
    [
      'Change',
      values.change === null || values.changePct === null
        ? '—'
        : formatChange(values.change, values.changePct, data.decimals),
    ],
    ...(data.hasVolume ? [['Volume', formatVolume(values.volume)] as [string, string]] : []),
  ];

  return (
    <div className={styles.window}>
      <p className={styles.time}>{formatBarTime(values.time, DISPLAY_TIME_ZONE)}</p>
      <dl className={styles.list}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {data.views.map((view) => (
        <section key={view.instance.uid} aria-label={view.label}>
          <h3 className={styles.heading}>{view.label}</h3>
          <dl className={styles.list}>
            {view.outputs.map((output) => {
              // Markers: a dot (pivots) shows its price on the bar it is drawn on; arrows (crosses)
              // hold direction codes, not prices, and are left out as in the legend.
              const dot = output.plot === 'markers' && output.style.shape !== undefined;
              if (output.plot === 'markers' && !dot) return null;
              const value = output.values[index + (dot ? output.displayShift : 0)];
              const volume =
                output.style.format === 'volume' || output.style.price_scale === 'volume';
              return (
                <div key={output.name} className={styles.row}>
                  <dt>{output.label}</dt>
                  <dd style={{ color: output.color }}>
                    {value === null || value === undefined
                      ? '—'
                      : volume
                        ? formatVolume(value)
                        : price(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

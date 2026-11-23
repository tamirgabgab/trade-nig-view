import { useChartDataStore } from '../store/chartDataStore.ts';
import { GAP_MIN_PCTS, useStructureStore } from '../store/structureStore.ts';
import { DISPLAY_TIME_ZONE } from '../chart/timeZone.ts';
import { formatBarTime } from './formatClock.ts';
import { formatPercent, formatPrice, plural } from './formatNumber.ts';
import styles from './GapsPanel.module.css';

/**
 * The gaps of the chart's series, newest first: direction, size, zone and whether (when) it was
 * filled. A click scrolls the chart to the gap. The settings (minimum size, partial gaps) live
 * here; the zones show on the chart while "Gaps" is on in the Structure menu.
 */
export function GapsPanel() {
  const on = useStructureStore((s) => s.gaps);
  const toggleGaps = useStructureStore((s) => s.toggleGaps);
  const minPct = useStructureStore((s) => s.gapMinPct);
  const partial = useStructureStore((s) => s.gapPartial);
  const setMinPct = useStructureStore((s) => s.setGapMinPct);
  const setPartial = useStructureStore((s) => s.setGapPartial);
  const data = useChartDataStore((s) => s.data);
  const focusBar = useChartDataStore((s) => s.focusBar);
  const gaps = [...(data?.gaps ?? [])].reverse();
  const decimals = data?.decimals ?? 2;
  const open = gaps.filter((g) => g.filledTime === null).length;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <label className={styles.check}>
          <input type="checkbox" checked={on} onChange={toggleGaps} />
          Show on chart
        </label>
        <label className={styles.field}>
          Min size
          <select
            className={styles.select}
            value={minPct}
            onChange={(event) => {
              setMinPct(Number(event.target.value));
            }}
          >
            {GAP_MIN_PCTS.map((pct) => (
              <option key={pct} value={pct}>
                {pct}%
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={partial}
            onChange={(event) => {
              setPartial(event.target.checked);
            }}
          />
          Partial gaps
        </label>
      </div>
      {!on ? (
        <p className={styles.empty}>Turn on “Show on chart” to find the gaps of this chart.</p>
      ) : gaps.length === 0 ? (
        <p className={styles.empty}>No gaps of {minPct}% or more on the loaded history.</p>
      ) : (
        <>
          <p className={styles.summary}>
            {plural(gaps.length, 'gap')}, {open} open
          </p>
          <ul className={styles.list} aria-label="Gaps">
            {gaps.map((gap) => (
              <li key={String(gap.time)}>
                <button
                  type="button"
                  className={styles.gap}
                  onClick={() => {
                    focusBar(gap.time);
                  }}
                >
                  <span className={gap.direction === 'up' ? styles.up : styles.down}>
                    {gap.direction === 'up' ? '▲' : '▼'} {formatPercent(gap.sizePct)}
                    {gap.kind === 'partial' ? ' partial' : ''}
                  </span>
                  <span className={styles.date}>{formatBarTime(gap.time, DISPLAY_TIME_ZONE)}</span>
                  <span className={styles.zone}>
                    {formatPrice(gap.bottom, decimals)} – {formatPrice(gap.top, decimals)}
                  </span>
                  <span className={styles.status}>
                    {gap.filledTime === null
                      ? 'Open'
                      : `Filled ${formatBarTime(gap.filledTime, DISPLAY_TIME_ZONE)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

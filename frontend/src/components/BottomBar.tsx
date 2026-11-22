import { CalendarRange } from 'lucide-react';

import { RANGE_LABEL, RANGES } from '../chart/visibleRange.ts';
import { useChartStore } from '../store/chartStore.ts';
import styles from './BottomBar.module.css';
import { Clock } from './Clock.tsx';
import { HealthBadge } from './HealthBadge.tsx';
import { IconButton } from './IconButton.tsx';

interface BottomBarProps {
  className?: string | undefined;
}

/** Bottom bar: visible-range buttons, go-to-date, clock, scale toggles, ADJ, API status. */
export function BottomBar({ className }: BottomBarProps) {
  const range = useChartStore((s) => s.range);
  const selectRange = useChartStore((s) => s.selectRange);
  const scaleMode = useChartStore((s) => s.scaleMode);
  const toggleScaleMode = useChartStore((s) => s.toggleScaleMode);
  const autoScale = useChartStore((s) => s.autoScale);
  const setAutoScale = useChartStore((s) => s.setAutoScale);
  const adjusted = useChartStore((s) => s.adjusted);
  const setAdjusted = useChartStore((s) => s.setAdjusted);

  return (
    <footer className={[styles.bar, className].join(' ')} aria-label="Chart range and scale">
      <div role="group" aria-label="Visible range" className={styles.ranges}>
        {RANGES.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.range}
            aria-pressed={range === id}
            aria-label={RANGE_LABEL[id]}
            title={RANGE_LABEL[id]}
            onClick={() => {
              selectRange(id);
            }}
          >
            {id}
          </button>
        ))}
      </div>
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Go to date"
        icon={<CalendarRange size={16} />}
        comingIn="R6"
        tooltipSide="top"
      />
      <span className={styles.spacer} />
      <Clock />
      <span className={styles.separator} aria-hidden="true" />
      <button
        type="button"
        className={styles.range}
        aria-pressed={scaleMode === 'percent'}
        aria-label="Percent scale"
        title="Percent scale"
        onClick={() => {
          toggleScaleMode('percent');
        }}
      >
        %
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={scaleMode === 'log'}
        aria-label="Logarithmic scale"
        title="Logarithmic scale"
        onClick={() => {
          toggleScaleMode('log');
        }}
      >
        log
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={autoScale}
        aria-label="Auto-fit price scale"
        title="Auto-fit price scale"
        onClick={() => {
          setAutoScale(!autoScale);
        }}
      >
        auto
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={adjusted}
        aria-label="Adjust history for dividends"
        title="Adjust history for dividends"
        onClick={() => {
          setAdjusted(!adjusted);
        }}
      >
        ADJ
      </button>
      <span className={styles.separator} aria-hidden="true" />
      <HealthBadge />
    </footer>
  );
}

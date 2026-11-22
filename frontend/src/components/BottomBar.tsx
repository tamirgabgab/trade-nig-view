import { CalendarRange } from 'lucide-react';
import { useState } from 'react';

import styles from './BottomBar.module.css';
import { Clock } from './Clock.tsx';
import { HealthBadge } from './HealthBadge.tsx';
import { IconButton } from './IconButton.tsx';
import { RANGES, type RangeId } from './ranges.ts';

type ScaleMode = 'normal' | 'percent' | 'log';

interface BottomBarProps {
  className?: string | undefined;
}

/**
 * Bottom bar: visible-range buttons, go-to-date, clock, scale toggles, ADJ, API status.
 * R0 keeps the selections as local UI state; R2 connects them to the chart.
 */
export function BottomBar({ className }: BottomBarProps) {
  const [range, setRange] = useState<RangeId>('1Y');
  const [scale, setScale] = useState<ScaleMode>('normal');
  const [autoScale, setAutoScale] = useState(true);
  const [adjusted, setAdjusted] = useState(true);

  const toggleScale = (mode: Exclude<ScaleMode, 'normal'>) => {
    setScale((current) => (current === mode ? 'normal' : mode));
  };

  return (
    <footer className={[styles.bar, className].join(' ')} aria-label="Chart range and scale">
      <div role="group" aria-label="Visible range">
        {RANGES.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.range}
            aria-pressed={range === id}
            onClick={() => {
              setRange(id);
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
        aria-pressed={scale === 'percent'}
        title="Percent scale"
        onClick={() => {
          toggleScale('percent');
        }}
      >
        %
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={scale === 'log'}
        title="Logarithmic scale"
        onClick={() => {
          toggleScale('log');
        }}
      >
        log
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={autoScale}
        title="Auto-fit price scale"
        onClick={() => {
          setAutoScale((value) => !value);
        }}
      >
        auto
      </button>
      <button
        type="button"
        className={styles.range}
        aria-pressed={adjusted}
        title="Adjust history for dividends"
        onClick={() => {
          setAdjusted((value) => !value);
        }}
      >
        ADJ
      </button>
      <span className={styles.separator} aria-hidden="true" />
      <HealthBadge />
    </footer>
  );
}

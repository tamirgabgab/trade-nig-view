import type { Interval } from '../api/bars.ts';
import { useChartStore } from '../store/chartStore.ts';
import { IconButton } from './IconButton.tsx';
import { SlidingPill } from './SlidingPill.tsx';
import styles from './Toolbar.module.css';

const OPTIONS: { interval: Interval; text: string; label: string }[] = [
  { interval: '1h', text: '1h', label: '1 hour' },
  { interval: '4h', text: '4h', label: '4 hours' },
  { interval: '1D', text: 'D', label: '1 day' },
  { interval: '1W', text: 'W', label: '1 week' },
  { interval: '1M', text: 'M', label: '1 month' },
];

/** Interval buttons (1h / 4h / D / W / M) in the top toolbar; exactly one is pressed. */
export function IntervalSwitcher() {
  const interval = useChartStore((s) => s.interval);
  const setInterval = useChartStore((s) => s.setInterval);
  return (
    <div role="group" aria-label="Interval" className={styles.group}>
      <SlidingPill />
      {OPTIONS.map((option) => (
        <IconButton
          key={option.interval}
          label={option.label}
          text={option.text}
          pressed={interval === option.interval}
          onClick={() => {
            setInterval(option.interval);
          }}
        />
      ))}
    </div>
  );
}

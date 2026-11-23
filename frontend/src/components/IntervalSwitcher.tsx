import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { IconButton } from './IconButton.tsx';
import { INTERVALS } from './intervals.ts';
import { SlidingPill } from './SlidingPill.tsx';
import styles from './Toolbar.module.css';

/** Interval buttons (1h / 4h / D / W / M) in the top toolbar; exactly one is pressed. */
export function IntervalSwitcher() {
  const interval = useChartStore((s) => s.interval);
  const setInterval = useChartStore((s) => s.setInterval);
  // The interval is locked during a bar replay (the user's choice, R7).
  const locked = useReplayStore((s) => s.mode !== 'off');
  return (
    <div role="group" aria-label="Interval" className={styles.group}>
      <SlidingPill />
      {INTERVALS.map((option) => (
        <IconButton
          key={option.interval}
          label={option.label}
          text={option.text}
          pressed={interval === option.interval}
          disabled={locked}
          title={locked ? 'Locked during bar replay' : undefined}
          onClick={() => {
            setInterval(option.interval);
          }}
        />
      ))}
    </div>
  );
}

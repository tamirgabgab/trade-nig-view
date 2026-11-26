import type { Bar } from '../api/bars.ts';
import styles from './ChartArea.module.css';
import { historyDepth } from './historyDepth.ts';

interface HistoryNoteProps {
  interval: string;
  start: number | null;
  windowDays: number;
  last: Bar['time'] | undefined;
  zone: string;
}

/** Under the legend of an intraday chart: how far back this interval's bars go. */
export function HistoryNote({ interval, start, windowDays, last, zone }: HistoryNoteProps) {
  return (
    <p
      className={styles.hint}
      title="Older bars stay in the local cache once downloaded, so this history grows over time (scripts/install-collector.ps1 collects it daily)."
    >
      {historyDepth(interval, start, windowDays, last, zone)}
    </p>
  );
}

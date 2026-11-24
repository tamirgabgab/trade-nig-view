import { History } from 'lucide-react';

import { instanceLabel, useIndicatorList, type Params } from '../../api/indicators.ts';
import { useSymbols } from '../../api/market.ts';
import { useChartStore } from '../../store/chartStore.ts';
import { useIndicatorStore } from '../../store/indicatorStore.ts';
import { useReplayStore } from '../../store/replayStore.ts';
import styles from './Lab.module.css';
import { withDefaults } from './labModel.ts';

export interface ReplayBlock {
  kind: 'replay';
  /** The universe's provider symbol, e.g. 'SPY' or '^GSPC'. */
  symbol: string;
  /** 'YYYY-MM-DD': the replay starts at the last bar on or before that day. */
  date: string;
  /** '1h' replays hourly bars (VWAP); daily by default. */
  interval?: '1D' | '1h';
  indicators?: { id: string; params?: Params }[];
}

const sameParams = (a: Params, b: Params) => Object.keys(b).every((key) => a[key] === b[key]);

/**
 * An exercise card's "Start in Replay": the chart switches to the symbol (daily or hourly), gets the
 * page's indicators (unless already on) and replays from the date.
 */
export function ReplayLab({ block }: { block: ReplayBlock }) {
  const specs = useIndicatorList().data ?? [];
  const display = useSymbols().data?.find((s) => s.symbol === block.symbol)?.display;
  const indicators = (block.indicators ?? []).map(({ id, params }) => {
    const spec = specs.find((s) => s.id === id);
    const full = withDefaults(spec, params);
    return { id, params: full, label: spec === undefined ? id : instanceLabel(spec, full) };
  });

  const start = () => {
    useReplayStore.getState().exit(); // the interval is locked while a replay runs
    const chart = useChartStore.getState();
    chart.setSymbol(block.symbol);
    chart.setInterval(block.interval ?? '1D');
    const store = useIndicatorStore.getState();
    for (const { id, params } of indicators) {
      const on = store.instances.some((i) => i.id === id && sameParams(i.params, params));
      if (!on) store.add(id, params);
    }
    useReplayStore.getState().start(block.symbol, block.date);
  };

  return (
    <section className={styles.lab} aria-label="Replay exercise">
      <div className={styles.controls}>
        <button type="button" className={styles.action} onClick={start}>
          <History size={16} aria-hidden="true" />
          Start in Replay
        </button>
        <span>
          {display ?? block.symbol}, {block.interval === '1h' ? 'hourly' : 'daily'}, from{' '}
          {block.date}
          {indicators.length > 0 && ` with ${indicators.map((i) => i.label).join(', ')}`}
        </span>
      </div>
    </section>
  );
}

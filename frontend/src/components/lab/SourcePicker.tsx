import { Dices } from 'lucide-react';

import { SCENARIOS, type LabSource, type Scenario } from '../../api/lab.ts';
import { useSymbols } from '../../api/market.ts';
import styles from './Lab.module.css';

/** Where a lab's bars come from: a synthetic scenario (with a new-sample button) or a real symbol. */
export function SourcePicker({
  source,
  onChange,
}: {
  source: LabSource;
  onChange: (source: LabSource) => void;
}) {
  const symbols = useSymbols().data ?? [];
  const synthetic = source.kind === 'synthetic';

  return (
    <div className={styles.source} role="group" aria-label="Data">
      <div className={styles.segment}>
        <button
          type="button"
          aria-pressed={synthetic}
          onClick={() => {
            if (!synthetic)
              onChange({ kind: 'synthetic', scenario: 'random_walk', seed: 1, bars: source.bars });
          }}
        >
          Random stock
        </button>
        <button
          type="button"
          aria-pressed={!synthetic}
          onClick={() => {
            if (synthetic)
              onChange({ kind: 'symbol', symbol: symbols[0]?.symbol ?? 'AAPL', bars: source.bars });
          }}
        >
          Real symbol
        </button>
      </div>
      {source.kind === 'synthetic' ? (
        <>
          <select
            className={styles.select}
            aria-label="Scenario"
            value={source.scenario}
            title={SCENARIOS.find((s) => s.id === source.scenario)?.hint}
            onChange={(event) => {
              onChange({ ...source, scenario: event.target.value as Scenario });
            }}
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="New random sample"
            title="New random sample (another seed)"
            onClick={() => {
              onChange({ ...source, seed: source.seed + 1 });
            }}
          >
            <Dices size={16} aria-hidden="true" />
          </button>
        </>
      ) : (
        <select
          className={styles.select}
          aria-label="Symbol"
          value={source.symbol}
          onChange={(event) => {
            onChange({ ...source, symbol: event.target.value });
          }}
        >
          {symbols.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.display} · {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

import { useSymbols } from '../api/market.ts';
import { isSynthetic, type ShuffleDefinition } from '../api/synthetic.ts';
import panel from './IndicatorSettingsPanel.module.css';
import { ShufflePreview } from './ShufflePreview.tsx';
import { FIRST_DAY, MAX_BLOCK_DAYS, shuffleProblem } from './syntheticChecks.ts';
import styles from './SyntheticSymbolDialog.module.css';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A shuffled copy's source (a market symbol), range and block length (K3), and what they draw.
 *  Picking a source asks for its whole range (`onSource`); the dates can then be narrowed. */
export function ShuffleFields({
  def,
  onChange,
  onSource,
}: {
  def: ShuffleDefinition;
  onChange: (change: Partial<ShuffleDefinition>) => void;
  onSource: (source: string) => void;
}) {
  const symbols = (useSymbols().data ?? []).filter((info) => !isSynthetic(info));
  const groups = [...new Set(symbols.map((info) => info.group))];
  const problem = shuffleProblem(def, today());
  const source = symbols.find((info) => info.symbol === def.source);
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="synthetic-source">Source</label>
        <select
          id="synthetic-source"
          className={panel.control}
          value={def.source}
          onChange={(event) => {
            onSource(event.target.value);
          }}
        >
          <option value="">Pick a symbol…</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {symbols
                .filter((info) => info.group === group)
                .map((info) => (
                  <option key={info.symbol} value={info.symbol}>
                    {info.display} · {info.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-start">From</label>
        <input
          id="synthetic-start"
          className={panel.control}
          type="date"
          value={def.start}
          min={FIRST_DAY}
          max={today()}
          onChange={(event) => {
            onChange({ start: event.target.value });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-end">To</label>
        <input
          id="synthetic-end"
          className={panel.control}
          type="date"
          value={def.end}
          min={FIRST_DAY}
          max={today()}
          onChange={(event) => {
            onChange({ end: event.target.value });
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="synthetic-block">Block (days)</label>
        <input
          id="synthetic-block"
          className={panel.control}
          type="number"
          min={1}
          max={MAX_BLOCK_DAYS}
          step={1}
          value={def.blockDays}
          onChange={(event) => {
            onChange({ blockDays: event.target.valueAsNumber });
          }}
        />
      </div>
      <p className={styles.hint}>
        The bars are cut into blocks of this many days, and the blocks put in another order: short
        blocks break trends, long ones keep them.
      </p>
      <ShufflePreview
        request={
          problem === null
            ? {
                source: def.source,
                start: def.start,
                end: def.end,
                blockDays: def.blockDays,
                seed: def.seed,
              }
            : null
        }
        sourceName={source?.display ?? def.source}
      />
      {problem !== null && def.source !== '' && (
        <p className={styles.hint}>No preview: {problem}</p>
      )}
    </>
  );
}

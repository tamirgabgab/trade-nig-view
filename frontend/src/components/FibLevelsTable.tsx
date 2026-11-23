import { useState } from 'react';

import type { FibLevel } from '../drawings/types.ts';
import panel from './IndicatorSettingsPanel.module.css';
import styles from './FibLevelsTable.module.css';

const MAX_RATIO = 10;

/** Edit a Fib drawing's levels: show or hide each, its ratio and its colour. */
export function FibLevelsTable({
  levels,
  onChange,
}: {
  levels: readonly FibLevel[];
  onChange: (levels: FibLevel[]) => void;
}) {
  // The typed ratio while it is not a valid number yet.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const set = (index: number, patch: Partial<FibLevel>) => {
    onChange(levels.map((level, i) => (i === index ? { ...level, ...patch } : level)));
  };

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Show</th>
          <th scope="col">Level</th>
          <th scope="col">Color</th>
        </tr>
      </thead>
      <tbody>
        {levels.map((level, index) => {
          const name = `Level ${String(index + 1)}`;
          const text = drafts[index] ?? String(level.value);
          const value = Number(text);
          const invalid = text === '' || !Number.isFinite(value) || Math.abs(value) > MAX_RATIO;
          return (
            <tr key={index}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Show ${name}`}
                  checked={level.visible}
                  onChange={(event) => {
                    set(index, { visible: event.target.checked });
                  }}
                />
              </td>
              <td>
                <input
                  className={panel.control}
                  type="number"
                  step="any"
                  aria-label={`${name} ratio`}
                  aria-invalid={invalid || undefined}
                  value={text}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDrafts((d) => ({ ...d, [index]: next }));
                    const ratio = Number(next);
                    if (next !== '' && Number.isFinite(ratio) && Math.abs(ratio) <= MAX_RATIO) {
                      set(index, { value: ratio });
                    }
                  }}
                  onBlur={() => {
                    setDrafts((d) =>
                      Object.fromEntries(Object.entries(d).filter(([k]) => k !== String(index))),
                    );
                  }}
                />
              </td>
              <td>
                <input
                  type="color"
                  className={panel.color}
                  aria-label={`${name} color`}
                  value={level.color}
                  onChange={(event) => {
                    set(index, { color: event.target.value });
                  }}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

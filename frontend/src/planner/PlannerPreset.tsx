import { useState } from 'react';

import panel from '../components/IndicatorSettingsPanel.module.css';
import { NO_TAX, savedKey, savedName } from '../store/plannerHomeStore.ts';
import styles from './Planner.module.css';

interface PlannerPresetProps {
  /** Names the table, e.g. "Purchase tax". */
  label: string;
  preset: string;
  /** The table was changed since it was picked. */
  edited: boolean;
  builtIn: { id: string; name: string; note: string }[];
  saved: string[];
  /** Offer "No tax" (an empty table). */
  allowNone?: boolean;
  onPick: (preset: string) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
}

/** Picks a tax table (built-in or saved) and saves the current one under a name. */
export function PlannerPreset({
  label,
  preset,
  edited,
  builtIn,
  saved,
  allowNone = false,
  onPick,
  onSave,
  onDelete,
}: PlannerPresetProps) {
  const [name, setName] = useState('');
  const own = savedName(preset);
  const note = builtIn.find((p) => p.id === preset)?.note;
  // A table of an older version, or a saved one that was lost: the first one stands in for it.
  const lost =
    note === undefined &&
    !(own !== null && saved.includes(own)) &&
    !(allowNone && preset === NO_TAX);
  return (
    <>
      <label className={styles.inline}>
        {label} table
        <select
          className={panel.control}
          aria-label={`${label} table`}
          value={preset}
          onChange={(event) => {
            onPick(event.target.value);
          }}
        >
          {builtIn.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {saved.map((key) => (
            <option key={key} value={savedKey(key)}>
              {key} (saved)
            </option>
          ))}
          {allowNone && <option value={NO_TAX}>No tax</option>}
        </select>
      </label>
      {note !== undefined && <p className={styles.note}>{note}</p>}
      {lost && (
        <p className={styles.warning} role="status">
          The table this plan used is no longer there; “{builtIn[0]?.name}” is used. Pick a table.
        </p>
      )}
      {edited && (
        <p className={styles.warning}>Changed: save it under a name to use it in other plans.</p>
      )}
      <div className={styles.saveRow}>
        <input
          className={panel.control}
          aria-label={`${label}: name to save under`}
          placeholder={own ?? 'Name of my table'}
          maxLength={40}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <button
          type="button"
          className={panel.secondary}
          disabled={name.trim() === '' && own === null}
          onClick={() => {
            // Without a new name, a saved table is saved over itself.
            onSave(name.trim() === '' ? (own ?? '') : name.trim());
            setName('');
          }}
        >
          Save {label.toLowerCase()} table
        </button>
        {own !== null && (
          <button
            type="button"
            className={panel.secondary}
            onClick={() => {
              onDelete(own);
            }}
          >
            Delete it
          </button>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';

import styles from './ForecastPanel.module.css';

/**
 * A number input that can be cleared and retyped: the typed text is kept while editing and
 * committed on Enter or when the field is left, only if it is a number in [min, max] (else the
 * stored value comes back).
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  /** Exclusive lower bound. */
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const v = Number(draft);
    if (draft !== null && draft.trim() !== '' && Number.isFinite(v) && v > min && v <= max) {
      onCommit(v);
    }
    setDraft(null);
  };
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
    </label>
  );
}

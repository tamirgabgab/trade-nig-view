import { useRef, useState } from 'react';

import panel from '../components/IndicatorSettingsPanel.module.css';

export interface PlannerNumberProps {
  /** The accessible name (the column header or the label next to it is the visible one). */
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/**
 * A number input that can be cleared and retyped: the typed text is kept while editing and
 * every number in [min, max] is applied at once. If the field is left holding anything else
 * (empty, out of range), the value from before the edit comes back, never a typed prefix.
 */
export function PlannerNumber({
  label,
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  disabled = false,
  onChange,
}: PlannerNumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const before = useRef(value);
  const valid = (typed: number) => Number.isFinite(typed) && typed >= min && typed <= max;
  return (
    <input
      className={panel.control}
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft ?? String(value)}
      onFocus={() => {
        before.current = value;
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        if (valid(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
      }}
      onBlur={() => {
        if (draft !== null && !valid(Number(draft === '' ? Number.NaN : draft))) {
          onChange(before.current);
        }
        setDraft(null);
      }}
    />
  );
}

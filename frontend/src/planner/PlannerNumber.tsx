import { useState } from 'react';

import panel from '../components/IndicatorSettingsPanel.module.css';

interface PlannerNumberProps {
  /** The accessible name (the column header or the label next to it is the visible one). */
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

/**
 * A number input that can be cleared and retyped: the typed text is kept while editing; every
 * valid number in [min, max] is applied at once, anything else is dropped when the field is left.
 */
export function PlannerNumber({
  label,
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  onChange,
}: PlannerNumberProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={panel.control}
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => {
        setDraft(event.target.value);
        const typed = event.target.valueAsNumber;
        if (Number.isFinite(typed) && typed >= min && typed <= max) onChange(typed);
      }}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}

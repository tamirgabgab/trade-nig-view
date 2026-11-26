import panel from '../components/IndicatorSettingsPanel.module.css';

interface PlannerSelectProps<T extends string> {
  label: string;
  /** The visible label when the accessible one is longer. */
  text?: string;
  value: T;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  className?: string | undefined;
  onChange: (value: T) => void;
}

/** A labelled select over a closed set of values. */
export function PlannerSelect<T extends string>({
  label,
  text,
  value,
  options,
  disabled = false,
  className,
  onChange,
}: PlannerSelectProps<T>) {
  return (
    <label className={className}>
      {text ?? label}
      <select
        className={panel.control}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const picked = options.find(([option]) => option === event.target.value);
          if (picked !== undefined) onChange(picked[0]);
        }}
      >
        {options.map(([option, name]) => (
          <option key={option} value={option}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

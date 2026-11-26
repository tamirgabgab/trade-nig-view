import { Plus, X } from 'lucide-react';

import type { TaxBracket } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import styles from './Planner.module.css';
import { PlannerNumber } from './PlannerNumber.tsx';

interface PlannerBracketsProps {
  /** Names the table in its fields' labels, e.g. "Purchase tax". */
  label: string;
  rows: TaxBracket[];
  onChange: (rows: TaxBracket[]) => void;
}

/** The last slice of a table has no upper bound. */
const open = (rows: TaxBracket[]) =>
  rows.map((row, index) => (index === rows.length - 1 ? { ...row, up_to: null } : row));

/** An editable tax table: each slice's upper bound and rate; the last slice has no bound. */
export function PlannerBrackets({ label, rows, onChange }: PlannerBracketsProps) {
  const change = (index: number, changes: Partial<TaxBracket>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  };
  const add = () => {
    const last = rows.at(-1);
    if (last === undefined) {
      onChange([{ up_to: null, rate_pct: 0 }]);
      return;
    }
    const floor = rows.at(-2)?.up_to ?? 0;
    onChange([...rows.slice(0, -1), { up_to: floor + 1_000_000, rate_pct: last.rate_pct }, last]);
  };
  return (
    <>
      {rows.length > 0 && (
        <table className={`${styles.rows} ${styles.brackets}`}>
          <thead>
            <tr>
              <th>Up to ₪</th>
              <th>Rate %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  {index === rows.length - 1 ? (
                    'and above'
                  ) : (
                    <PlannerNumber
                      label={`${label} bracket ${String(index + 1)} up to`}
                      value={row.up_to ?? 0}
                      min={1}
                      step={1000}
                      onChange={(up_to) => {
                        change(index, { up_to });
                      }}
                    />
                  )}
                </td>
                <td>
                  <PlannerNumber
                    label={`${label} bracket ${String(index + 1)} rate %`}
                    value={row.rate_pct}
                    max={100}
                    step={0.5}
                    onChange={(rate_pct) => {
                      change(index, { rate_pct });
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove ${label} bracket ${String(index + 1)}`}
                    onClick={() => {
                      onChange(open(rows.filter((_, i) => i !== index)));
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className={panel.secondary}
        disabled={rows.length >= 12}
        onClick={add}
        aria-label={`Add ${label} bracket`}
      >
        <Plus size={14} aria-hidden="true" />
        Add bracket
      </button>
    </>
  );
}

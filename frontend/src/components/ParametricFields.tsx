import { useState } from 'react';

import {
  DISTRIBUTIONS,
  type Distribution,
  type ParametricDefinition,
  type ReturnShape,
} from '../api/synthetic.ts';
import panel from './IndicatorSettingsPanel.module.css';
import { ReturnPreview } from './ReturnPreview.tsx';
import { previewProblem } from './syntheticChecks.ts';
import styles from './SyntheticSymbolDialog.module.css';

type NumberKey = Exclude<keyof ReturnShape, 'distribution' | 'exact'>;

interface NumberSpec {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const TARGETS: readonly NumberSpec[] = [
  { key: 'meanPct', label: 'Expected return (% a year)', min: -50, max: 100, step: 0.5 },
  { key: 'volPct', label: 'Volatility σ (% a year)', min: 1, max: 100, step: 0.5 },
];
// The spinner's lowest; a typed 2.1 is fine (the form's own checks, not the browser's).
const DF: NumberSpec = { key: 'df', label: 'Degrees of freedom ν', min: 2.5, max: 100, step: 0.5 };
const SKEW: NumberSpec = { key: 'skew', label: 'Skew α', min: -20, max: 20, step: 1 };
/** What a hidden family field goes back to when it is not valid (the backend checks it anyway). */
const DEFAULT_DF = 5;
const DEFAULT_SKEW = -4;
const LAYERS: readonly NumberSpec[] = [
  { key: 'memory', label: 'Memory φ (AR(1))', min: -0.9, max: 0.9, step: 0.05 },
  { key: 'jumpsPerYear', label: 'Jumps a year λ', min: 0, max: 50, step: 1 },
  { key: 'jumpMeanPct', label: 'Jump mean (%)', min: -50, max: 50, step: 1 },
  { key: 'jumpSdPct', label: 'Jump spread (%)', min: 0, max: 50, step: 1 },
  { key: 'garchAlpha', label: 'GARCH α (shock)', min: 0, max: 0.5, step: 0.01 },
  { key: 'garchBeta', label: 'GARCH β (persistence)', min: 0, max: 0.99, step: 0.01 },
];

/** A parametric symbol's statistics (K2): the targets, the family, the layers, and what they draw
 *  (or why nothing is drawn). */
export function ParametricFields({
  def,
  onChange,
}: {
  def: ParametricDefinition;
  onChange: (change: Partial<ReturnShape>) => void;
}) {
  const problem = previewProblem(def);
  // Open while a layer is on, at first; then only the user opens and closes it (a layer cleared
  // to retype it must not fold the field away).
  const [layersOpen, setLayersOpen] = useState(
    def.memory !== 0 || def.jumpsPerYear > 0 || def.garchAlpha > 0 || def.garchBeta > 0,
  );
  const row = (spec: NumberSpec) => (
    <div key={spec.key} className={styles.field}>
      <label htmlFor={`synthetic-${spec.key}`}>{spec.label}</label>
      <input
        id={`synthetic-${spec.key}`}
        className={panel.control}
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={def[spec.key]}
        onChange={(event) => {
          const change: Partial<ReturnShape> = {};
          change[spec.key] = event.target.valueAsNumber;
          onChange(change);
        }}
      />
    </div>
  );
  const family = DISTRIBUTIONS.find((d) => d.id === def.distribution);
  return (
    <>
      {TARGETS.map(row)}
      <div className={styles.field}>
        <label htmlFor="synthetic-distribution">Distribution</label>
        <select
          id="synthetic-distribution"
          className={panel.control}
          value={def.distribution}
          onChange={(event) => {
            // The field of the family left behind is hidden: put it back to a valid value.
            onChange({
              distribution: event.target.value as Distribution,
              ...(def.df > 2 && def.df <= 100 ? {} : { df: DEFAULT_DF }),
              ...(def.skew >= -20 && def.skew <= 20 ? {} : { skew: DEFAULT_SKEW }),
            });
          }}
        >
          {DISTRIBUTIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {family && <p className={styles.hint}>{family.hint}</p>}
      {def.distribution === 'student_t' && row(DF)}
      {def.distribution === 'skew_normal' && row(SKEW)}
      <div className={styles.field}>
        <label htmlFor="synthetic-exact">Mean and σ</label>
        <select
          id="synthetic-exact"
          className={panel.control}
          value={def.exact ? 'exact' : 'expected'}
          onChange={(event) => {
            onChange({ exact: event.target.value === 'exact' });
          }}
        >
          <option value="expected">Expected (the path varies)</option>
          <option value="exact">Exact in this path</option>
        </select>
      </div>
      <details
        className={styles.layers}
        open={layersOpen}
        onToggle={(event) => {
          setLayersOpen(event.currentTarget.open);
        }}
      >
        <summary>Layers: memory, jumps, GARCH</summary>
        {LAYERS.map(row)}
      </details>
      <ReturnPreview def={problem === null ? def : null} />
      {problem !== null && <p className={styles.hint}>No preview: {problem}</p>}
    </>
  );
}

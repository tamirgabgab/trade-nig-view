import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerStore } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerNumber } from './PlannerNumber.tsx';

/** The inflation both sides of the planner use: real results, linked tracks, indexed costs. */
export function PlannerInflation() {
  const inflation = usePlannerStore((s) => s.form.inflation);
  const update = usePlannerStore((s) => s.update);
  const assumed = inflation.mode === 'assumed';
  return (
    <fieldset className={styles.section}>
      <legend>Inflation</legend>
      <div className={styles.grid}>
        <label className={styles.wide}>
          Index
          <select
            className={panel.control}
            value={inflation.mode}
            onChange={(event) => {
              const mode = event.target.value === 'historical' ? 'historical' : 'assumed';
              update({ inflation: { ...inflation, mode } });
            }}
          >
            <option value="assumed">Assumed (mean, spread, persistence)</option>
            <option value="historical">Actual CPI (from 1994)</option>
          </select>
        </label>
        <label>
          Mean % a year
          <PlannerNumber
            label="Inflation mean % a year"
            value={inflation.mean}
            min={-20}
            max={100}
            step={0.1}
            onChange={(mean) => {
              update({ inflation: { ...inflation, mean } });
            }}
          />
        </label>
        <label>
          Standard deviation %
          <PlannerNumber
            label="Inflation standard deviation %"
            value={inflation.sd}
            max={100}
            step={0.1}
            onChange={(sd) => {
              update({ inflation: { ...inflation, sd } });
            }}
          />
        </label>
        <label>
          Persistence (0 to 0.99)
          <PlannerNumber
            label="Inflation persistence"
            value={inflation.persistence}
            max={0.99}
            step={0.05}
            onChange={(persistence) => {
              update({ inflation: { ...inflation, persistence } });
            }}
          />
        </label>
        <label className={panel.check}>
          <input
            type="checkbox"
            checked={inflation.random}
            disabled={!assumed}
            onChange={(event) => {
              update({ inflation: { ...inflation, random: event.target.checked } });
            }}
          />
          Draw a path
        </label>
      </div>
      <p className={styles.note}>
        Each year’s rate = mean + persistence × (last year’s rate − mean) + noise; a year’s rate is
        spread evenly over its months. Without a draw the index follows the mean.
      </p>
    </fieldset>
  );
}

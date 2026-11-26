import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';
import type { SimulationSettings } from './simulation.ts';

const METHODS: readonly (readonly [SimulationSettings['method'], string])[] = [
  ['bootstrap', 'Block bootstrap (history in blocks)'],
  ['monte_carlo', 'Monte Carlo (a modelled market)'],
];

interface PlannerSimulationFormProps {
  settings: SimulationSettings;
  onChange: (settings: SimulationSettings) => void;
}

/** Many possible worlds for the same plan: how they are made, and what counts as stress. */
export function PlannerSimulationForm({ settings, onChange }: PlannerSimulationFormProps) {
  const set = (changes: Partial<SimulationSettings>) => {
    onChange({ ...settings, ...changes });
  };
  const modelled = settings.method === 'monte_carlo';
  return (
    <fieldset className={styles.section}>
      <legend>Simulation</legend>
      <div className={styles.grid}>
        <PlannerSelect
          className={styles.wide}
          label="Simulation method"
          text="Method"
          value={settings.method}
          options={METHODS}
          onChange={(method) => {
            set({ method });
          }}
        />
        <PlannerField
          label="Worlds"
          value={settings.runs}
          min={10}
          max={10_000}
          step={100}
          onChange={(runs) => {
            set({ runs });
          }}
        />
        {modelled ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={settings.estimate}
                onChange={(event) => {
                  set({ estimate: event.target.checked });
                }}
              />
              Estimate the market from the mix’s history
            </label>
            <PlannerField
              label="Market mean % a year"
              value={settings.mean}
              min={-50}
              max={100}
              step={0.5}
              disabled={settings.estimate}
              onChange={(mean) => {
                set({ mean });
              }}
            />
            <PlannerField
              label="Market volatility % a year"
              value={settings.sd}
              max={200}
              step={0.5}
              disabled={settings.estimate}
              onChange={(sd) => {
                set({ sd });
              }}
            />
            <PlannerField
              label="Correlation of the apartment with the market"
              text="Apartment–market correlation"
              value={settings.correlation}
              min={-1}
              max={1}
              step={0.1}
              onChange={(correlation) => {
                set({ correlation });
              }}
            />
          </>
        ) : null}
        <PlannerField
          label="Block length (months)"
          value={settings.blockMonths}
          min={1}
          max={120}
          onChange={(blockMonths) => {
            set({ blockMonths });
          }}
        />
        <PlannerField
          label="Monthly net income ₪"
          value={settings.income}
          step={500}
          onChange={(income) => {
            set({ income });
          }}
        />
        <PlannerField
          label="Payment stress above % of income"
          text="Stress above % of income"
          value={settings.stressShare}
          max={100}
          onChange={(stressShare) => {
            set({ stressShare });
          }}
        />
      </div>
      <p className={styles.note}>
        Every world gives the plan another history. What a tab marks “historical” (the apartment’s
        value, the rates, the CPI) is cut from history in blocks, all series of a month together;
        what it marks “assumed” is drawn from its mean and spread, whatever its “draw a path” box
        says. The Bank of Israel rate comes with its block, so it jumps where two blocks meet.{' '}
        {modelled
          ? 'The market is one modelled asset in shekels in place of the mix; the correlation ties an apartment value marked “assumed” to it. The blocks still cut whatever is historical.'
          : 'The market is the mix’s own history, in the same blocks.'}{' '}
        The income rises with the CPI; leave it at 0 to skip the payment stress.
      </p>
    </fieldset>
  );
}

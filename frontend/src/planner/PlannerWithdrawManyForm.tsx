import panel from '../components/IndicatorSettingsPanel.module.css';
import type { WithdrawMany } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';

const METHODS = [
  ['bootstrap', 'Cut from the mix’s history'],
  ['monte_carlo', 'A modelled market'],
] as const;

interface PlannerWithdrawManyFormProps {
  many: WithdrawMany;
  set: (changes: Partial<WithdrawMany>) => void;
  /** The plan pays a fixed amount: it has a sustainable amount to look for. */
  fixed: boolean;
  /** The account grows by an assumed return: a modelled market takes its mean from it. */
  assumed: boolean;
}

/** How the plan is run on many realizations: the worlds of a simulation, and the target share. */
export function PlannerWithdrawManyForm({
  many,
  set,
  fixed,
  assumed,
}: PlannerWithdrawManyFormProps) {
  const modelled = many.method === 'monte_carlo';
  return (
    <fieldset className={styles.section}>
      <legend>History and simulated worlds</legend>
      <div className={styles.grid}>
        <PlannerSelect
          className={styles.wide}
          label="The worlds’ market"
          value={many.method}
          options={METHODS}
          onChange={(method) => {
            set({ method });
          }}
        />
        <PlannerField
          label="Worlds"
          value={many.runs}
          min={10}
          max={5000}
          step={10}
          onChange={(runs) => {
            set({ runs });
          }}
        />
        <PlannerField
          label="Seed"
          value={many.seed}
          step={1}
          onChange={(seed) => {
            set({ seed });
          }}
        />
        {!modelled && (
          <PlannerField
            label="Block, months"
            value={many.block}
            min={1}
            max={120}
            step={1}
            onChange={(block) => {
              set({ block });
            }}
          />
        )}
        {modelled && !assumed && (
          <label className={panel.check}>
            <input
              type="checkbox"
              checked={many.estimate}
              onChange={(event) => {
                set({ estimate: event.target.checked });
              }}
            />
            Estimate it from the mix
          </label>
        )}
        {modelled && !assumed && !many.estimate && (
          <PlannerField
            label="Mean % a year"
            value={many.mean}
            min={-50}
            max={100}
            step={0.5}
            onChange={(mean) => {
              set({ mean });
            }}
          />
        )}
        {modelled && (assumed || !many.estimate) && (
          <PlannerField
            label="Volatility % a year"
            value={many.sd}
            max={200}
            step={1}
            onChange={(sd) => {
              set({ sd });
            }}
          />
        )}
        {fixed && (
          <PlannerField
            label="Sustainable: lasts in %"
            value={many.sustain}
            min={50}
            max={100}
            step={1}
            onChange={(sustain) => {
              set({ sustain });
            }}
          />
        )}
      </div>
      <p className={styles.note}>
        Run history starts the plan on every month the mix’s history allows. Simulate runs it on
        worlds: cut from that history in blocks, so what moved together still does, or drawn from a
        modelled market{assumed ? ' whose mean is the assumed return' : ''}. An assumed return has
        no history: only the modelled market can run on it.
      </p>
    </fieldset>
  );
}

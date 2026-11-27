import type { WithdrawResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { shekels } from './plannerFormat.ts';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';

/** One option's plan as it was run: its rule in words, and its result or why it could not run. */
export interface BesidePlan {
  label: string;
  result: WithdrawResult | string;
}

const of =
  (read: (result: WithdrawResult) => string) =>
  ({ result }: BesidePlan) =>
    typeof result === 'string' ? '—' : read(result);

const COLUMNS: PlannerColumn<BesidePlan>[] = [
  ['Option', (plan) => plan.label],
  [
    'Lasts',
    ({ result }) =>
      typeof result === 'string'
        ? `Cannot run: ${result}`
        : result.summary.depleted_on === null
          ? 'All of it'
          : `Until ${result.summary.depleted_on}`,
  ],
  ['Left at the end', of((r) => shekels(r.summary.balance))],
  ['Taken, net', of((r) => shekels(r.summary.taken))],
  ['Tax paid', of((r) => shekels(r.summary.tax))],
  ['Lowest month, real', of((r) => shekels(r.summary.lowest_net_real))],
];

/** The two options' withdrawal plans, each with its own settings and mix, in one table. */
export function PlannerWithdrawBeside({ plans }: { plans: BesidePlan[] }) {
  return (
    <>
      <h2 className={styles.heading}>The two options, side by side</h2>
      <PlannerTable label="Side by side" columns={COLUMNS} rows={plans} />
      <p className={styles.note}>
        Each option runs with its own Withdraw settings and its own Market mix. The results below
        are of the option that was on screen; a study (history, worlds) runs for that option too.
      </p>
    </>
  );
}

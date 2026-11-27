import { useState } from 'react';

import { runWithdraw, type WithdrawResult } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerStore } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';
import { PlannerWithdrawResults } from './PlannerWithdrawResults.tsx';
import { mixLabel, toWithdraw } from './withdraw.ts';

const RETURNS = [
  ['mix', 'The Market tab’s mix'],
  ['assumed', 'An assumed yearly return'],
] as const;
const RULES = [
  ['fixed', 'A fixed amount'],
  ['percent', 'A percent of the account'],
] as const;

/**
 * The planner's withdrawals: a starting capital, money taken every month by a rule, and what
 * is left (POST /api/planner/withdraw). The account is the Market tab's, or grows by an assumed
 * yearly return; its fees and taxes are the Market tab's either way.
 */
export function PlannerWithdraw({ hidden }: { hidden: boolean }) {
  const settings = usePlannerStore((s) => s.withdraw);
  const form = usePlannerStore((s) => s.form);
  const same = usePlannerStore((s) => s.same);
  const slot = usePlannerStore((s) => s.slot);
  const set = usePlannerStore((s) => s.setWithdraw);
  const [running, setRunning] = useState(false);
  // What was run, with the rule it was run under: a later edit must not relabel it.
  const [shown, setShown] = useState<{ result: WithdrawResult; fixed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assumed = settings.returns === 'assumed';
  const fixed = settings.rule === 'fixed';
  const ready = settings.start !== '';
  const run = () => {
    if (!ready) return;
    setRunning(true);
    setError(null);
    runWithdraw(toWithdraw(settings, form))
      .then((result) => {
        setShown({ result, fixed });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different plan.
        setShown(null);
      })
      .finally(() => {
        setRunning(false);
      });
  };
  const whose = same
    ? 'the Market tab’s mix'
    : `option ${slot.toUpperCase()}’s mix (the one on screen)`;

  return (
    <div className={styles.page} role="tabpanel" aria-label="Withdraw" hidden={hidden}>
      <form
        className={styles.form}
        // The number fields check their own range; the browser's step check would block Run.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <h1 className={styles.title}>Planner: withdrawals</h1>
        <fieldset className={styles.section}>
          <legend>The account</legend>
          <div className={styles.grid}>
            <PlannerField
              label="Starting capital ₪"
              value={settings.capital}
              // The arrows step from the minimum: a round one keeps the steps round.
              min={10_000}
              step={10_000}
              onChange={(capital) => {
                set({ capital });
              }}
            />
            <PlannerField
              label="Cost share %"
              value={settings.costShare}
              max={100}
              step={5}
              onChange={(costShare) => {
                set({ costShare });
              }}
            />
            <PlannerSelect
              label="The account grows by"
              value={settings.returns}
              options={RETURNS}
              onChange={(returns) => {
                set({ returns });
              }}
            />
            {assumed && (
              <PlannerField
                label="Yearly return %"
                value={settings.yearly}
                min={-50}
                max={100}
                step={0.5}
                onChange={(yearly) => {
                  set({ yearly });
                }}
              />
            )}
          </div>
          <p className={styles.note}>
            {assumed
              ? 'The Market tab’s mix is not used: the account grows by the assumed return, an effective yearly rate in shekels, the same every month. The Market tab’s fees and taxes still apply.'
              : `Runs ${whose}: ${mixLabel(form)}, with its fees and taxes, over history from the start day.`}{' '}
            The cost share is how much of the capital was paid for it; the rest is gain that is
            taxed when sold. The results show the plan at 0% and at 100% beside it.
          </p>
        </fieldset>
        <fieldset className={styles.section}>
          <legend>The withdrawals</legend>
          <div className={styles.grid}>
            <label>
              Starts on
              <input
                className={panel.control}
                type="date"
                value={settings.start}
                onChange={(event) => {
                  set({ start: event.target.value });
                }}
              />
            </label>
            <PlannerField
              label="Years"
              value={settings.years}
              min={1}
              max={100}
              step={1}
              onChange={(years) => {
                set({ years });
              }}
            />
            <PlannerSelect
              className={styles.wide}
              label="Withdrawal rule"
              value={settings.rule}
              options={RULES}
              onChange={(rule) => {
                set({ rule });
              }}
            />
            {fixed ? (
              <>
                <PlannerField
                  label="Amount ₪ a month, net"
                  value={settings.amount}
                  min={500}
                  step={500}
                  onChange={(amount) => {
                    set({ amount });
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={settings.indexed}
                    onChange={(event) => {
                      set({ indexed: event.target.checked });
                    }}
                  />
                  Rises with the CPI
                </label>
              </>
            ) : (
              <PlannerField
                label="Sold % a year"
                value={settings.percent}
                min={0.5}
                max={1200}
                step={0.5}
                onChange={(percent) => {
                  set({ percent });
                }}
              />
            )}
          </div>
          <p className={styles.note}>
            {fixed
              ? 'The amount is what reaches the hand after the tax and the costs, in shekels of the first day; the first one is a month after the start. With the box ticked it keeps its buying power (the Market tab’s inflation).'
              : 'A twelfth of the percent is sold every month, the first time a month after the start. The income is what is left of the sale after the tax and the costs, so it moves with the market. The withdrawals alone never empty the account; a fee larger than what is left can.'}
          </p>
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" className={panel.primary} disabled={running || !ready}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </form>
      <div className={styles.results} aria-live="polite" aria-busy={running}>
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {shown === null && error === null && (
          <p className={styles.note}>
            Set the capital and the rule, then press Run: how long a fixed amount lasts, or what a
            percent pays, with the tax between its two bounds.
          </p>
        )}
        {shown !== null && <PlannerWithdrawResults result={shown.result} fixed={shown.fixed} />}
      </div>
    </div>
  );
}

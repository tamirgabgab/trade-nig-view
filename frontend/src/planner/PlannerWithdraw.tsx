import { useState } from 'react';

import {
  runWithdraw,
  runWithdrawSimulate,
  runWithdrawStudy,
  type WithdrawManyResult,
  type WithdrawResult,
} from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerStore, type Slot } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerLearn } from './PlannerLearn.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';
import { PlannerSlot } from './PlannerSlot.tsx';
import { PlannerWithdrawBeside, type BesidePlan } from './PlannerWithdrawBeside.tsx';
import { PlannerWithdrawHome } from './PlannerWithdrawHome.tsx';
import { PlannerWithdrawMany } from './PlannerWithdrawMany.tsx';
import { PlannerWithdrawManyForm } from './PlannerWithdrawManyForm.tsx';
import { PlannerWithdrawResults } from './PlannerWithdrawResults.tsx';
import {
  mixLabel,
  ruleLabel,
  toWithdraw,
  toWithdrawSimulate,
  toWithdrawStudy,
} from './withdraw.ts';

const RETURNS = [
  ['mix', 'The Market tab’s mix'],
  ['assumed', 'An assumed yearly return'],
] as const;
const SOURCES = [
  ['capital', 'A capital I enter'],
  ['plan', 'What the Market tab’s plan accumulated'],
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
  // The other option's settings and mix, for the two plans side by side.
  const otherSettings = usePlannerStore((s) => s.withdrawOther);
  const otherForm = usePlannerStore((s) => s.other);
  const same = usePlannerStore((s) => s.same);
  const slot = usePlannerStore((s) => s.slot);
  const set = usePlannerStore((s) => s.setWithdraw);
  const [status, setStatus] = useState<'idle' | 'running' | 'studying' | 'simulating'>('idle');
  const running = status !== 'idle';
  // What was run, with the rule it was run under: a later edit must not relabel it. One study
  // at a time beside the plan: the starts of history, or simulated worlds.
  const [shown, setShown] = useState<{
    /** The plan from the start entered, or why it cannot run on its own (a study still can). */
    result: WithdrawResult | string;
    many: WithdrawManyResult | null;
    fixed: boolean;
    home: boolean;
    /** Both options, A first, when each has settings of its own; `option` names the one shown. */
    beside: BesidePlan[] | null;
    /** The option on screen when it ran: its results stay while the other one is shown. */
    slot: Slot;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // From the Market tab's plan: the capital, its cost and the first day follow from it.
  const fromPlan = settings.source === 'plan';
  const assumed = !fromPlan && settings.returns === 'assumed';
  const fixed = settings.rule === 'fixed';
  const ready = (fromPlan ? form.end : settings.start) !== '';
  const start = (next: typeof status, many: Promise<WithdrawManyResult | null>) => {
    if (!ready) return;
    setStatus(next);
    setError(null);
    // The plan itself is run with every study, so the two always belong together. A study
    // stands without it: worlds for a plan that ends after the mix's last bar, say.
    const reason = (cause: unknown) =>
      cause instanceof Error ? cause.message : 'The request failed';
    const own = runWithdraw(toWithdraw(settings, form)).catch(reason);
    const other = same ? null : runWithdraw(toWithdraw(otherSettings, otherForm)).catch(reason);
    Promise.all([own, many, other])
      .then(([result, more, aside]) => {
        // Nothing ran: the plan failed, there was no study, and the other option has no result.
        if (typeof result === 'string' && more === null && typeof (aside ?? '') === 'string') {
          throw new Error(result);
        }
        const mine = { label: ruleLabel(settings), result };
        const theirs = aside === null ? null : { label: ruleLabel(otherSettings), result: aside };
        setShown({
          result,
          many: more,
          fixed,
          home: settings.home.include,
          // Option A first, whichever of the two is on screen.
          beside:
            theirs === null
              ? null
              : (slot === 'a' ? [mine, theirs] : [theirs, mine]).map((plan, index) => ({
                  ...plan,
                  label: `${index === 0 ? 'A' : 'B'}: ${plan.label}`,
                })),
          slot,
        });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different plan.
        setShown(null);
      })
      .finally(() => {
        setStatus('idle');
      });
  };
  const run = () => {
    start('running', Promise.resolve(null));
  };
  // While the two options are apart, results name the option they were run for.
  const option = shown === null || same ? undefined : `Option ${shown.slot.toUpperCase()}`;
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
        <PlannerSlot />
        <fieldset className={styles.section}>
          <legend>The account</legend>
          <div className={styles.grid}>
            <PlannerSelect
              className={styles.wide}
              label="The account is"
              value={settings.source}
              options={SOURCES}
              onChange={(source) => {
                set({ source });
              }}
            />
          </div>
          {fromPlan ? (
            <p className={styles.note}>
              The withdrawals start on {form.end}, the day the Market tab’s plan ends. Its deposits
              are the account’s lots ({mixLabel(form)}, with its fees and taxes), so the capital and
              its cost are not typed, and a sale takes the oldest lot first within each asset: the
              tax is each lot’s own, with no bounds.
            </p>
          ) : (
            <>
              <div className={styles.grid}>
                <PlannerField
                  label="Starting capital ₪"
                  value={settings.capital}
                  // Zero is a plan only with an apartment; the arrows step from a round minimum.
                  min={0}
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
            </>
          )}
          <PlannerLearn page="cost-basis">The cost of what is sold</PlannerLearn>
        </fieldset>
        <PlannerWithdrawHome
          // Another option on screen starts the section again: open when that one has an apartment.
          key={slot}
          home={settings.home}
          set={(changes) => {
            set({ home: { ...settings.home, ...changes } });
          }}
        />
        <fieldset className={styles.section}>
          <legend>The withdrawals</legend>
          <div className={styles.grid}>
            {!fromPlan && (
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
            )}
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
          <PlannerLearn page="withdrawals">
            Withdrawals: what is left, and for how long
          </PlannerLearn>
        </fieldset>
        <PlannerWithdrawManyForm
          many={settings.many}
          set={(changes) => {
            set({ many: { ...settings.many, ...changes } });
          }}
          fixed={fixed}
          assumed={assumed}
        />
        <div className={styles.actions}>
          <button type="submit" className={panel.primary} disabled={running || !ready}>
            {status === 'running' ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            className={panel.secondary}
            disabled={running || !ready}
            onClick={() => {
              start('studying', runWithdrawStudy(toWithdrawStudy(settings, form)));
            }}
          >
            {status === 'studying' ? 'Running history…' : 'Run history'}
          </button>
          <button
            type="button"
            className={panel.secondary}
            disabled={running || !ready}
            onClick={() => {
              start('simulating', runWithdrawSimulate(toWithdrawSimulate(settings, form)));
            }}
          >
            {status === 'simulating' ? 'Simulating…' : 'Simulate'}
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
            percent pays, with the tax between its two bounds. Run history tries every start the
            data allows, and Simulate many possible worlds.
          </p>
        )}
        {/* The study a button ran leads; the plan it was run with follows. */}
        {shown !== null && shown.many !== null && (
          <PlannerWithdrawMany
            result={shown.many}
            fixed={shown.fixed}
            home={shown.home}
            option={option}
          />
        )}
        {shown?.beside != null && <PlannerWithdrawBeside plans={shown.beside} />}
        {shown !== null &&
          (typeof shown.result === 'string' ? (
            <p className={styles.warning}>
              The plan from the start entered cannot run on its own: {shown.result}.
            </p>
          ) : (
            <PlannerWithdrawResults
              result={shown.result}
              fixed={shown.fixed}
              home={shown.home}
              option={option}
            />
          ))}
      </div>
    </div>
  );
}

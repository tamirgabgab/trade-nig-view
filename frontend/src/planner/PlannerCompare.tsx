import { useState } from 'react';

import {
  runScenario,
  studyScenario,
  type ScenarioRequest,
  type ScenarioResult,
  type StudyResult,
} from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { usePlannerStore } from '../store/plannerStore.ts';
import { toScenario } from './compare.ts';
import styles from './Planner.module.css';
import { PlannerScenario, PlannerStudy } from './PlannerCompareResults.tsx';
import { useHomeTaxes } from './useHomeTaxes.ts';

type Status = 'idle' | 'comparing' | 'studying';
const STEPS = [1, 3, 6, 12];
/** The win map's columns, in years. */
const HORIZONS = [5, 10, 15, 20, 25, 30];

/**
 * The planner's comparison: the Apartment tab's apartment against the same money in the Market
 * tab's mix, for the plan as entered (POST /api/planner/run) and for every start history
 * allows (POST /api/planner/study).
 */
export function PlannerCompare({ hidden }: { hidden: boolean }) {
  const form = usePlannerStore((s) => s.form);
  const home = usePlannerHomeStore((s) => s.home);
  const { taxes } = useHomeTaxes();
  const [ownAccount, setOwnAccount] = useState(false);
  const [followRates, setFollowRates] = useState(true);
  const [firstStart, setFirstStart] = useState('');
  const [lastStart, setLastStart] = useState('');
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<Status>('idle');
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [study, setStudy] = useState<StudyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The names the results were made under: a later tick of the box must not rename them.
  const [names, setNames] = useState<[string, string]>(['Apartment', 'Market']);

  const ready = taxes !== null && home.start !== '' && home.end !== '';
  const start = (
    next: Status,
    work: (request: ScenarioRequest, names: [string, string]) => Promise<void>,
  ) => {
    if (taxes === null || !ready) return;
    setStatus(next);
    setError(null);
    work(toScenario(form, home, taxes, ownAccount), [
      ownAccount ? 'Apartment and account' : 'Apartment',
      'Market',
    ])
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different comparison.
        setScenario(null);
        setStudy(null);
      })
      .finally(() => {
        setStatus('idle');
      });
  };
  const compare = () => {
    start('comparing', async (request, next) => {
      setScenario(await runScenario(request));
      setStudy(null);
      setNames(next);
    });
  };
  const runStudy = () => {
    start('studying', async (request, next) => {
      const [one, many] = await Promise.all([
        runScenario(request),
        studyScenario({
          ...request,
          first_start: firstStart === '' ? null : firstStart,
          last_start: lastStart === '' ? null : lastStart,
          step_months: step,
          follow_rates: followRates,
          horizons_years: HORIZONS,
        }),
      ]);
      setScenario(one);
      setStudy(many);
      setNames(next);
    });
  };

  return (
    <div className={styles.page} role="tabpanel" aria-label="Compare" hidden={hidden}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          compare();
        }}
      >
        <h1 className={styles.title}>Planner: apartment against market</h1>
        <fieldset className={styles.section}>
          <legend>The two options</legend>
          <p className={styles.note}>
            The apartment of the Apartment tab, against the same money in the Market tab’s mix: the
            market side invests the equity and the purchase costs on the purchase day, and every
            month what the apartment costs (the payment and the owner costs, less the rent). A month
            in which the rent exceeds the costs is invested by the apartment’s side.
          </p>
          <div className={styles.grid}>
            <label className={styles.wide}>
              <input
                type="checkbox"
                checked={ownAccount}
                onChange={(event) => {
                  setOwnAccount(event.target.checked);
                }}
              />
              The apartment’s side also makes the Market tab’s deposits
            </label>
          </div>
        </fieldset>
        <fieldset className={styles.section}>
          <legend>History</legend>
          <div className={styles.grid}>
            <label>
              First start
              <input
                type="date"
                className={panel.control}
                value={firstStart}
                onChange={(event) => {
                  setFirstStart(event.target.value);
                }}
              />
            </label>
            <label>
              Last start
              <input
                type="date"
                className={panel.control}
                value={lastStart}
                onChange={(event) => {
                  setLastStart(event.target.value);
                }}
              />
            </label>
            <label>
              A start every
              <select
                className={panel.control}
                value={step}
                onChange={(event) => {
                  setStep(Number(event.target.value));
                }}
              >
                {STEPS.map((months) => (
                  <option key={months} value={months}>
                    {months === 1 ? 'Month' : `${months} months`}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.wide}>
              <input
                type="checkbox"
                checked={followRates}
                onChange={(event) => {
                  setFollowRates(event.target.checked);
                }}
              />
              Move the tracks’ rates with the Bank of Israel rate of each start
            </label>
          </div>
          <p className={styles.note}>
            The plan is started on every month the data can run it (empty dates: as far as it goes).
            The apartment’s value, the rates and the CPI follow history only where their tab says
            “historical”. With the box ticked, a fixed or variable track that is not CPI-linked gets
            the rate you entered plus the move of the Bank of Israel rate between your purchase day
            and the window’s; it needs historical rates in the Apartment tab.
          </p>
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" className={panel.primary} disabled={status !== 'idle' || !ready}>
            {status === 'comparing' ? 'Comparing…' : 'Compare'}
          </button>
          <button
            type="button"
            className={panel.secondary}
            disabled={status !== 'idle' || !ready}
            onClick={runStudy}
          >
            {status === 'studying' ? 'Running history…' : 'Run history'}
          </button>
        </div>
      </form>
      <div className={styles.results} aria-live="polite" aria-busy={status !== 'idle'}>
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {scenario === null && error === null && (
          <p className={styles.note}>
            Set the apartment and the market mix in their tabs, then press Compare for the plan as
            entered, or Run history for every start the data allows. The numbers are a model, not
            advice.
          </p>
        )}
        {scenario !== null && (
          <PlannerScenario result={scenario} names={names} rent={home.rent.monthly} />
        )}
        {study !== null && <PlannerStudy result={study} names={names} />}
      </div>
    </div>
  );
}

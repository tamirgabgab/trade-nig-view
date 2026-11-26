import { useState } from 'react';

import {
  runScenario,
  simulateScenario,
  studyScenario,
  type ScenarioRequest,
  type ScenarioResult,
  type SimulationResult,
  type StudyResult,
} from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { usePlannerStore } from '../store/plannerStore.ts';
import { toScenario } from './compare.ts';
import styles from './Planner.module.css';
import { PlannerScenario } from './PlannerScenario.tsx';
import { PlannerSimulation } from './PlannerSimulation.tsx';
import { PlannerSimulationForm } from './PlannerSimulationForm.tsx';
import { PlannerStudy } from './PlannerStudy.tsx';
import { DEFAULT_SIMULATION, toSimulation } from './simulation.ts';
import { useHomeTaxes } from './useHomeTaxes.ts';

type Status = 'idle' | 'comparing' | 'studying' | 'simulating';
/** The names of the two options and the apartment's monthly rent, as a comparison ran. */
interface Shown {
  names: [string, string];
  rent: number;
}
const STEPS = [1, 3, 6, 12];
/** The win map's columns, in years. */
const HORIZONS = [5, 10, 15, 20, 25, 30];

/**
 * The planner's comparison: the Apartment tab's apartment against the same money in the Market
 * tab's mix, for the plan as entered (POST /api/planner/run), for every start history allows
 * (POST /api/planner/study) and over many simulated worlds (POST /api/planner/simulate).
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
  const [settings, setSettings] = useState(DEFAULT_SIMULATION);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the results were made under: a later edit of the forms must not relabel them.
  const [shown, setShown] = useState<Shown>({ names: ['Apartment', 'Market'], rent: 0 });

  const ready = taxes !== null && home.start !== '' && home.end !== '';
  const start = (next: Status, work: (request: ScenarioRequest, next: Shown) => Promise<void>) => {
    if (taxes === null || !ready) return;
    setStatus(next);
    setError(null);
    work(toScenario(form, home, taxes, ownAccount), {
      names: [ownAccount ? 'Apartment and account' : 'Apartment', 'Market'],
      rent: home.rent.monthly,
    })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different comparison.
        setScenario(null);
        setStudy(null);
        setSimulation(null);
      })
      .finally(() => {
        setStatus('idle');
      });
  };
  const compare = () => {
    start('comparing', async (request, next) => {
      setScenario(await runScenario(request));
      setStudy(null);
      setSimulation(null);
      setShown(next);
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
      setSimulation(null);
      setShown(next);
    });
  };
  const simulate = () => {
    start('simulating', async (request, next) => {
      const [one, many] = await Promise.all([
        runScenario(request),
        simulateScenario({ ...request, ...toSimulation(settings, followRates) }),
      ]);
      setScenario(one);
      setStudy(null);
      setSimulation(many);
      setShown(next);
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
            “historical”. With the box ticked, the rates you entered count as today’s quotes: a
            fixed or variable track that is not CPI-linked gets its rate plus the Bank of Israel
            rate of the window’s purchase day minus today’s. It needs historical rates in the
            Apartment tab.
          </p>
        </fieldset>
        <PlannerSimulationForm settings={settings} onChange={setSettings} />
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
          <button
            type="button"
            className={panel.secondary}
            disabled={status !== 'idle' || !ready}
            onClick={simulate}
          >
            {status === 'simulating' ? 'Simulating…' : 'Simulate'}
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
            entered, Run history for every start the data allows, or Simulate for many possible
            worlds. The numbers are a model, not advice.
          </p>
        )}
        {scenario !== null && (
          <PlannerScenario result={scenario} names={shown.names} rent={shown.rent} />
        )}
        {study !== null && <PlannerStudy result={study} names={shown.names} />}
        {simulation !== null && <PlannerSimulation result={simulation} names={shown.names} />}
      </div>
    </div>
  );
}

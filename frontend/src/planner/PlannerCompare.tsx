import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

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
import { homesOf, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { formsOf, linked, SLOTS, usePlannerStore } from '../store/plannerStore.ts';
import { optionNames, toScenario } from './compare.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerScenario } from './PlannerScenario.tsx';
import { PlannerScenarios } from './PlannerScenarios.tsx';
import { PlannerSimulation } from './PlannerSimulation.tsx';
import { PlannerSimulationForm } from './PlannerSimulationForm.tsx';
import { PlannerStudy } from './PlannerStudy.tsx';
import { toSimulation } from './simulation.ts';
import { useHomeTaxes } from './useHomeTaxes.ts';
import { PlannerLearn } from './PlannerLearn.tsx';

type Status = 'idle' | 'comparing' | 'studying' | 'simulating';
/** The names of the two options and the rents of their apartments, as a comparison ran. */
interface Shown {
  names: [string, string];
  rents: number[];
  /** Counts the requests, so each simulation's chart starts fresh. */
  run: number;
}
const STEPS = [1, 3, 6, 12];
/** What an option can contain, with the checkbox of each. */
const CONTENTS = [
  ['home', 'apartment'],
  ['deposits', 'its own market deposits'],
] as const;
/** A fraction as a percentage with two decimals, for a number field. */
const percentOf = (fraction: number) => Math.round(fraction * 10_000) / 100;
/** The win map's columns, in years. */
const HORIZONS = [5, 10, 15, 20, 25, 30];

/**
 * The planner's comparison of its two options, each made of its own tabs: for the plan as
 * entered (POST /api/planner/run), for every start history allows (POST /api/planner/study) and
 * over many simulated worlds (POST /api/planner/simulate).
 */
export function PlannerCompare({ hidden }: { hidden: boolean }) {
  // While option B is the same as option A, both are read from A's forms.
  const same = usePlannerStore((s) => s.same);
  const market = linked(same, usePlannerStore(useShallow(formsOf)));
  const homes = linked(same, usePlannerHomeStore(useShallow(homesOf)));
  const contents = usePlannerStore((s) => s.contents);
  const {
    discount,
    firstStart,
    lastStart,
    step,
    followRates,
    simulation: settings,
  } = usePlannerStore((s) => s.compare);
  const { setContents, setCompare } = usePlannerStore.getState();
  const { both } = useHomeTaxes();
  const taxes = both && linked(same, both);
  const [status, setStatus] = useState<Status>('idle');
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [study, setStudy] = useState<StudyResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the results were made under: a later edit of the forms must not relabel them.
  const [shown, setShown] = useState<Shown>({ names: ['Apartment', 'Market'], rents: [], run: 0 });

  const bought = SLOTS.filter((slot) => contents[slot].home).map((slot) => homes[slot]);
  const request =
    taxes === null ? null : toScenario({ market, home: homes, taxes, contents, discount });
  const ready =
    request !== null && request.end !== '' && bought.every((h) => h.start !== '' && h.end !== '');
  const start = (next: Status, work: (request: ScenarioRequest, next: Shown) => Promise<void>) => {
    if (!ready) return;
    setStatus(next);
    setError(null);
    work(request, {
      names: optionNames(contents),
      rents: bought.filter((h) => h.rent.mode !== 'none').map((h) => h.rent.monthly),
      run: shown.run + 1,
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
  // A loaded scenario runs the basic comparison once its forms are on screen and the tax tables
  // are in (the latest load wins). One that cannot run leaves Compare disabled, as when typed.
  const pendingRun = useRef(false);
  // A render even when the loaded forms equal those on screen: the run waits for one.
  const [, setLoads] = useState(0);
  const loaded = () => {
    pendingRun.current = true;
    setLoads((n) => n + 1);
  };
  const runLoaded = useEffectEvent(() => {
    // Not alongside a run still going: it would finish last over the loaded plan's results.
    if (!pendingRun.current || taxes === null || status !== 'idle') return;
    pendingRun.current = false;
    if (ready) compare();
  });
  useEffect(() => {
    // After the render: the run sets the status, so not within the effect itself.
    const timer = window.setTimeout(() => {
      runLoaded();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  });
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
      // The estimate goes into its fields, so unticking the box starts from it.
      const model = many.market;
      if (model?.estimated) {
        // The settings as they are now: they may have changed while the simulation ran.
        const { simulation: now } = usePlannerStore.getState().compare;
        setCompare({
          simulation: { ...now, mean: percentOf(model.mean), sd: percentOf(model.sd) },
        });
      }
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
        <h1 className={styles.title}>Planner: compare two options</h1>
        <fieldset className={styles.section}>
          <legend>The two options</legend>
          <p className={styles.note}>
            {same
              ? 'Both options are made of the Market and the Apartment tabs as they are; untick “Option B is the same as option A” there to give option B forms of its own.'
              : 'Each option is made of its own Market and Apartment tabs.'}{' '}
            Both spend the same money on the same days: what one option pays and the other does not
            (an apartment’s equity and purchase costs, then every month its payment and owner costs
            less the rent, or a deposit), the other invests in its own mix. Each apartment is sold
            on its own “Sold on”; the rest is sold on the later sale, or on option A’s market end
            with no apartment. What an earlier sale nets waits in its option’s mix until then.
          </p>
          <PlannerLearn page="same-money">The same money rule</PlannerLearn>
          <div className={styles.grid}>
            {SLOTS.map((slot) =>
              CONTENTS.map(([part, name]) => (
                <label key={`${slot}:${part}`} className={styles.wide}>
                  <input
                    type="checkbox"
                    checked={contents[slot][part]}
                    onChange={(event) => {
                      setContents(slot, { [part]: event.target.checked });
                    }}
                  />
                  Option {slot.toUpperCase()}: {name}
                </label>
              )),
            )}
            <PlannerField
              label="Forced sale discount %"
              value={discount}
              max={100}
              onChange={(next) => {
                setCompare({ discount: next });
              }}
            />
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
                  setCompare({ firstStart: event.target.value });
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
                  setCompare({ lastStart: event.target.value });
                }}
              />
            </label>
            <label>
              A start every
              <select
                className={panel.control}
                value={step}
                onChange={(event) => {
                  setCompare({ step: Number(event.target.value) });
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
                  setCompare({ followRates: event.target.checked });
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
          <PlannerLearn page="overlapping-windows">Overlapping windows</PlannerLearn>
        </fieldset>
        <PlannerSimulationForm
          settings={settings}
          onChange={(simulation) => {
            setCompare({ simulation });
          }}
        />
        <PlannerScenarios onLoaded={loaded} />
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
            Set each option in the Market and the Apartment tabs, then press Compare for the plan as
            entered, Run history for every start the data allows, or Simulate for many possible
            worlds. The numbers are a model, not advice.
          </p>
        )}
        {scenario !== null && (
          <PlannerScenario result={scenario} names={shown.names} rents={shown.rents} />
        )}
        {study !== null && <PlannerStudy result={study} names={shown.names} />}
        {simulation !== null && (
          <PlannerSimulation result={simulation} names={shown.names} run={shown.run} />
        )}
      </div>
    </div>
  );
}

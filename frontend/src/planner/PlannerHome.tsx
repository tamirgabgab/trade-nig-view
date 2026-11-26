import { useState } from 'react';

import { runHome, type HomeResult } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { toHomeRequest, usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import { usePlannerStore } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerHomeBasics } from './PlannerHomeBasics.tsx';
import { PlannerHomeCosts } from './PlannerHomeCosts.tsx';
import { PlannerHomeResults } from './PlannerHomeResults.tsx';
import { PlannerHomeTaxes } from './PlannerHomeTaxes.tsx';
import { PlannerHomeTracks } from './PlannerHomeTracks.tsx';
import { PlannerInflation } from './PlannerInflation.tsx';
import { useHomeTaxes } from './useHomeTaxes.ts';

/**
 * The planner's apartment side: a purchase with a mortgage, held and sold on one day. The inputs
 * are kept in the browser; the results come from POST /api/planner/home.
 */
export function PlannerHome({ hidden }: { hidden: boolean }) {
  const home = usePlannerHomeStore((s) => s.home);
  const reset = usePlannerHomeStore((s) => s.reset);
  const inflation = usePlannerStore((s) => s.form.inflation);
  const { taxes } = useHomeTaxes();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = taxes !== null && home.start !== '' && home.end !== '';
  const run = () => {
    if (!ready) return;
    setRunning(true);
    setError(null);
    runHome(toHomeRequest(home, inflation, taxes))
      .then(setResult)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different plan.
        setResult(null);
      })
      .finally(() => {
        setRunning(false);
      });
  };

  return (
    <div className={styles.page} role="tabpanel" aria-label="Apartment" hidden={hidden}>
      <form
        className={styles.form}
        // The number fields check their own range; the browser's step check would block Run.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <h1 className={styles.title}>Planner: apartment</h1>
        <PlannerHomeBasics />
        <PlannerHomeTracks />
        <PlannerHomeCosts />
        <PlannerHomeTaxes />
        <PlannerInflation />
        <div className={styles.actions}>
          <button type="submit" className={panel.primary} disabled={running || !ready}>
            {running ? 'Running…' : 'Run'}
          </button>
          <button type="button" className={panel.secondary} onClick={reset}>
            Reset inputs
          </button>
        </div>
      </form>
      <div className={styles.results} aria-live="polite" aria-busy={running}>
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {result === null && error === null && (
          <p className={styles.note}>
            Set the apartment, the mortgage tracks and the costs, then press Run. The numbers are a
            model: compare a track with your bank’s offer before relying on it.
          </p>
        )}
        {result !== null && <PlannerHomeResults result={result} />}
      </div>
    </div>
  );
}

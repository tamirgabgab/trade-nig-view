import { useState } from 'react';

import { assetDepths, runMarket, type AssetDepth, type MarketResult } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { toRequest, usePlannerStore } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerAssets } from './PlannerAssets.tsx';
import { PlannerAssetsTable } from './PlannerAssetsTable.tsx';
import { PlannerDeposits } from './PlannerDeposits.tsx';
import { PlannerDepositsTable } from './PlannerDepositsTable.tsx';
import { PlannerOptions } from './PlannerOptions.tsx';
import { PlannerSummary } from './PlannerSummary.tsx';

type Status = 'idle' | 'running' | 'checking';

/**
 * The planner (Phase H), market side: deposits into a mix of assets, sold on one day. The inputs
 * on the left are kept in the browser; the results come from POST /api/planner/market.
 */
export function PlannerPage({ className }: { className: string | undefined }) {
  const form = usePlannerStore((s) => s.form);
  const reset = usePlannerStore((s) => s.reset);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MarketResult | null>(null);
  const [depths, setDepths] = useState<AssetDepth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (next: Status, work: () => Promise<void>) => {
    setStatus(next);
    setError(null);
    work()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The request failed');
        // Never an error above the results of an earlier, different request.
        setResult(null);
        setDepths(null);
      })
      .finally(() => {
        setStatus('idle');
      });
  };
  const run = () => {
    start('running', async () => {
      setResult(await runMarket(toRequest(form)));
      setDepths(null);
    });
  };
  const check = () => {
    start('checking', async () => {
      setDepths(await assetDepths(toRequest(form).assets));
    });
  };

  const assets = depths ?? result?.assets ?? null;
  return (
    <section className={[styles.page, className].join(' ')} aria-label="Planner">
      <form
        className={styles.form}
        // The number fields check their own range; the browser's step check would block Run.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <h1 className={styles.title}>Planner: market account</h1>
        <PlannerAssets />
        <PlannerDeposits />
        <PlannerOptions />
        <div className={styles.actions}>
          <button type="submit" className={panel.primary} disabled={status !== 'idle'}>
            {status === 'running' ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            className={panel.secondary}
            disabled={status !== 'idle'}
            onClick={check}
          >
            {status === 'checking' ? 'Checking…' : 'Check data history'}
          </button>
          <button type="button" className={panel.secondary} onClick={reset}>
            Reset inputs
          </button>
        </div>
      </form>
      <div className={styles.results} aria-live="polite" aria-busy={status !== 'idle'}>
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {assets === null && error === null && (
          <p className={styles.note}>
            Set the assets and the deposits, then press Run. “Check data history” shows how far back
            each ticker goes before you choose the dates.
          </p>
        )}
        {result !== null && depths === null && (
          <>
            <PlannerSummary summary={result.summary} />
            {result.warnings.map((warning) => (
              <p key={warning} className={styles.warning}>
                {warning}
              </p>
            ))}
          </>
        )}
        {assets !== null && (
          <>
            <h2 className={styles.heading}>Data history</h2>
            <PlannerAssetsTable assets={assets} />
            {result !== null && depths === null && (
              <p className={styles.note}>
                The earliest day a plan with this mix can start: {result.earliest_start}.
                {result.fx_market_from !== null &&
                  ` USD/ILS is Yahoo’s market rate from ${result.fx_market_from}.`}
              </p>
            )}
          </>
        )}
        {result !== null && depths === null && (
          <>
            <h2 className={styles.heading}>Deposits ({result.deposits.length})</h2>
            <div className={styles.scroll}>
              <PlannerDepositsTable deposits={result.deposits} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

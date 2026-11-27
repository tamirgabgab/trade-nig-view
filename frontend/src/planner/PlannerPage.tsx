import { useState } from 'react';

import settings from '../components/SettingsDialog.module.css';
import { usePlannerStore } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerCompare } from './PlannerCompare.tsx';
import { PlannerHome } from './PlannerHome.tsx';
import { PlannerMarket } from './PlannerMarket.tsx';
import { PlannerWithdraw } from './PlannerWithdraw.tsx';

const TABS = [
  ['market', 'Market'],
  ['home', 'Apartment'],
  ['compare', 'Compare'],
  ['withdraw', 'Withdraw'],
] as const;

/**
 * The planner (Phase H): a market account, an apartment, their comparison and withdrawals, each
 * on its own tab. All stay mounted, so a tab keeps its results while another one is looked at.
 */
export function PlannerPage({ className }: { className: string | undefined }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('market');
  // The results of a tab belong to the forms they were run with: another option on screen, or a
  // loaded scenario, starts the two tabs again.
  const forms = usePlannerStore((s) => `${s.slot}:${String(s.loads)}`);
  return (
    <section className={[styles.shell, className].join(' ')} aria-label="Planner">
      <div className={settings.tabs} role="tablist" aria-label="Planner sides">
        {TABS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={settings.tab}
            onClick={() => {
              setTab(id);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <PlannerMarket key={`market:${forms}`} hidden={tab !== 'market'} />
      <PlannerHome key={`home:${forms}`} hidden={tab !== 'home'} />
      <PlannerCompare hidden={tab !== 'compare'} />
      <PlannerWithdraw key={`withdraw:${forms}`} hidden={tab !== 'withdraw'} />
    </section>
  );
}

import { useState } from 'react';

import settings from '../components/SettingsDialog.module.css';
import styles from './Planner.module.css';
import { PlannerCompare } from './PlannerCompare.tsx';
import { PlannerHome } from './PlannerHome.tsx';
import { PlannerMarket } from './PlannerMarket.tsx';

const TABS = [
  ['market', 'Market'],
  ['home', 'Apartment'],
  ['compare', 'Compare'],
] as const;

/**
 * The planner (Phase H): a market account, an apartment and their comparison, each on its own
 * tab. All stay mounted, so a tab keeps its results while another one is looked at.
 */
export function PlannerPage({ className }: { className: string | undefined }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('market');
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
      <PlannerMarket hidden={tab !== 'market'} />
      <PlannerHome hidden={tab !== 'home'} />
      <PlannerCompare hidden={tab !== 'compare'} />
    </section>
  );
}

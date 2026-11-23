import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import { FilterView } from './FilterView.tsx';
import { IconButton } from './IconButton.tsx';
import styles from './LearnDrawer.module.css';
import { LearnPage } from './LearnPage.tsx';
import type { IndicatorView } from './useChartIndicators.ts';

type Tab = 'page' | 'filter';
const TABS: { id: Tab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'filter', label: 'Filter view' },
];

/**
 * Right-hand drawer (over the watchlist, the chart stays visible) with the learn page of the
 * indicator whose book icon was pressed and, for averages, its measured filter response.
 */
export function LearnDrawer({ views }: { views: readonly IndicatorView[] }) {
  const learnFor = useUiStore((s) => s.learnFor);
  const openLearn = useUiStore((s) => s.openLearn);
  const [tab, setTab] = useState<Tab>('page');
  const titleId = useId();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const tablist = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const view = views.find((v) => v.instance.uid === learnFor);
  const spec = view?.spec;

  // Focus the selected tab on open and on a switch to another indicator; give focus back to
  // the Learn button that opened the drawer when it closes.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !tablist.current?.parentElement?.contains(active)) {
      opener.current = active;
    }
    tablist.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [learnFor]);
  useEffect(
    () => () => {
      opener.current?.focus();
    },
    [],
  );

  if (view === undefined || spec === undefined) return null;
  const tabs = spec.category === 'moving_averages' ? TABS : TABS.slice(0, 1);
  const shown = tabs.some((t) => t.id === tab) ? tab : 'page';

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const i = tabs.findIndex((t) => t.id === shown);
    const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next === undefined) return;
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <aside
      className={styles.drawer}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') openLearn(null);
      }}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {spec.name}
          </h2>
          <span className={styles.subtitle}>{view.label}</span>
        </div>
        <IconButton
          className={styles.close}
          label="Close learn panel"
          shortcut="Esc"
          icon={<X size={18} />}
          tooltipSide="bottom-end"
          onClick={() => {
            openLearn(null);
          }}
        />
      </header>
      <div
        ref={tablist}
        className={styles.tabs}
        role="tablist"
        aria-label="Learn sections"
        onKeyDown={onTabKey}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${titleId}-${t.id}`}
            className={styles.tab}
            aria-selected={shown === t.id}
            aria-controls={`${titleId}-panel`}
            tabIndex={shown === t.id ? 0 : -1}
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`${titleId}-panel`}
        className={styles.body}
        role="tabpanel"
        aria-labelledby={`${titleId}-${shown}`}
      >
        {shown === 'page' ? (
          <LearnPage slug={spec.learnSlug} />
        ) : (
          <FilterView key={view.instance.uid} spec={spec} params={view.params} />
        )}
      </div>
    </aside>
  );
}

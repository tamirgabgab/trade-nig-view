import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { useIndicatorList } from '../api/indicators.ts';
import { useLearnIndex } from '../api/lab.ts';
import { PAGE_PREFIX, useUiStore } from '../store/uiStore.ts';
import { FilterView } from './FilterView.tsx';
import { IconButton } from './IconButton.tsx';
import styles from './LearnDrawer.module.css';
import { withDefaults } from './lab/labModel.ts';
import { TryIt } from './lab/TryIt.tsx';
import { LearnPage } from './LearnPage.tsx';
import { restoreFocus, type OverlayAttrs } from './usePresence.ts';
import type { IndicatorView } from './useChartIndicators.ts';

type Tab = 'page' | 'try' | 'filter';
const TABS: { id: Tab; label: string }[] = [
  { id: 'page', label: 'Page' },
  { id: 'try', label: 'Try it' },
  { id: 'filter', label: 'Filter view' },
];

/**
 * Right-hand drawer (over the watchlist, the chart stays visible) with the learn page of the
 * indicator whose book icon was pressed and, for averages, its measured filter response.
 */
export function LearnDrawer({
  views,
  learnFor,
  attrs,
}: {
  views: readonly IndicatorView[];
  /** Instance shown (ChartArea keeps it during the exit animation, see usePresence). */
  learnFor: string;
  attrs: OverlayAttrs;
}) {
  const openLearn = useUiStore((s) => s.openLearn);
  const [tab, setTab] = useState<Tab>('page');
  const titleId = useId();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const tablist = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // An indicator on the chart (its uid), or a page opened from the index ("page:<slug>").
  const view = views.find((v) => v.instance.uid === learnFor);
  // "page:<slug>#<heading>" (a learn link) opens the page at that heading.
  const [pageSlug = null, anchor = null] = learnFor.startsWith(PAGE_PREFIX)
    ? learnFor.slice(PAGE_PREFIX.length).split('#')
    : [];
  const registry = useIndicatorList().data;
  const index = useLearnIndex().data;
  const spec =
    view?.spec ??
    (pageSlug === null
      ? undefined
      : registry?.find((s) => s.id === index?.find((e) => e.slug === pageSlug)?.indicatorId));
  const slug = spec?.learnSlug ?? pageSlug;
  const title = spec?.name ?? index?.find((e) => e.slug === pageSlug)?.title ?? pageSlug ?? '';
  const params = view?.params ?? (spec === undefined ? {} : withDefaults(spec, {}));

  // Focus the selected tab on open and on a switch to another indicator; give focus back to
  // the Learn button that opened the drawer when it closes.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !tablist.current?.parentElement?.contains(active)) {
      opener.current = active;
    }
    tablist.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [learnFor]);
  useEffect(() => {
    const drawer = tablist.current?.parentElement;
    return () => {
      restoreFocus(opener.current, drawer);
    };
  }, []);

  if (slug === null) return null;
  const tabs = TABS.filter(
    (t) =>
      t.id === 'page' ||
      (spec !== undefined && (t.id === 'try' || spec.category === 'moving_averages')),
  );
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
      {...attrs}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          openLearn(null);
        }
      }}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <span className={styles.subtitle}>
            {view?.label ?? (spec === undefined ? 'Concept' : 'Learn page')}
          </span>
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
        {shown === 'page' || spec === undefined ? (
          <LearnPage slug={slug} anchor={anchor} />
        ) : shown === 'try' ? (
          <TryIt key={learnFor} spec={spec} initial={params} />
        ) : (
          <FilterView key={learnFor} spec={spec} params={params} />
        )}
      </div>
    </aside>
  );
}

import {
  Activity,
  Bell,
  BookOpen,
  CalendarRange,
  ChartColumnBig,
  ChartSpline,
  List,
  ListTree,
  ShieldAlert,
  Waves,
  Sigma,
  Target,
  TableProperties,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useUiStore, type SidebarTab } from '../store/uiStore.ts';
import { DataWindow } from './DataWindow.tsx';
import { GapsPanel } from './GapsPanel.tsx';
import { ObjectTree } from './ObjectTree.tsx';

import { IconButton } from './IconButton.tsx';
import styles from './RightSidebar.module.css';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery.ts';
import { usePresence } from './usePresence.ts';
import { ForecastPanel } from './ForecastPanel.tsx';
import { StatisticsPanel } from './StatisticsPanel.tsx';
import { SymbolCard } from './SymbolCard.tsx';
import { RegimePanel } from './RegimePanel.tsx';
import { RiskPanel } from './RiskPanel.tsx';
import { TradePlanPanel } from './TradePlanPanel.tsx';
import { VolatilityPanel } from './VolatilityPanel.tsx';
import { Watchlist } from './Watchlist.tsx';

interface RightSidebarProps {
  className?: string | undefined;
}

const TABS: { tab: SidebarTab; title: string; icon: typeof List }[] = [
  { tab: 'watchlist', title: 'Watchlist', icon: List },
  { tab: 'objects', title: 'Object tree', icon: ListTree },
  { tab: 'data', title: 'Data window', icon: TableProperties },
  { tab: 'gaps', title: 'Gaps', icon: ChartColumnBig },
  { tab: 'stats', title: 'Statistics', icon: Sigma },
  { tab: 'forecast', title: 'Forecast', icon: ChartSpline },
  { tab: 'volatility', title: 'Volatility', icon: Activity },
  { tab: 'tradeplan', title: 'Trade plan', icon: Target },
  { tab: 'risk', title: 'Risk', icon: ShieldAlert },
  { tab: 'regime', title: 'Regime', icon: Waves },
];

/**
 * The side panel (Watchlist, Data window or Gaps) plus the narrow widget bar on the far right. On
 * a wide window the panel is a column (its button collapses it); below 1100 px it floats over the
 * chart, opened from a button and closed with that button, Esc or a click outside.
 */
export function RightSidebar({ className }: RightSidebarProps) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const { docked, floating } = useUiStore((s) => s.watchlist);
  const tab = useUiStore((s) => s.sidebarTab);
  const showSidebar = useUiStore((s) => s.showSidebar);
  const openModal = useUiStore((s) => s.openModal);
  const closeFloating = useUiStore((s) => s.closeFloatingWatchlist);
  const open = narrow ? floating : docked;
  const panel = usePresence(open ? tab : null);
  const asideRef = useRef<HTMLElement>(null);

  // Floating: Esc or a click outside the sidebar closes it.
  useEffect(() => {
    if (!narrow || !floating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // An Esc that closed a dialog or panel first (they preventDefault) is not for us.
      if (event.key === 'Escape' && !event.defaultPrevented) closeFloating();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !asideRef.current?.contains(event.target)) {
        closeFloating();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [narrow, floating, closeFloating]);

  return (
    <aside
      ref={asideRef}
      className={[styles.sidebar, className].join(' ')}
      aria-label="Watchlist and details"
    >
      {panel.shown !== null && (
        <section
          className={[styles.panel, narrow ? styles.floating : ''].join(' ')}
          aria-labelledby="sidebar-title"
          {...panel.attrs}
        >
          <div className={styles.panelHeader}>
            <span id="sidebar-title">{TABS.find((t) => t.tab === panel.shown)?.title}</span>
          </div>
          <div className={styles.scroll}>
            {panel.shown === 'watchlist' && <Watchlist />}
            {panel.shown === 'objects' && <ObjectTree />}
            {panel.shown === 'data' && <DataWindow />}
            {panel.shown === 'gaps' && <GapsPanel />}
            {panel.shown === 'stats' && <StatisticsPanel />}
            {panel.shown === 'forecast' && <ForecastPanel />}
            {panel.shown === 'volatility' && <VolatilityPanel />}
            {panel.shown === 'tradeplan' && <TradePlanPanel />}
            {panel.shown === 'risk' && <RiskPanel />}
            {panel.shown === 'regime' && <RegimePanel />}
          </div>
          {panel.shown === 'watchlist' && <SymbolCard />}
        </section>
      )}
      <div
        className={styles.widgetBar}
        role="toolbar"
        aria-label="Sidebar widgets"
        aria-orientation="vertical"
      >
        {TABS.map(({ tab: id, title, icon: Icon }) => {
          const shown = open && tab === id;
          return (
            <IconButton
              key={id}
              label={`${shown ? 'Hide' : 'Show'} ${title.toLowerCase()}`}
              icon={<Icon size={20} />}
              pressed={shown}
              tooltipSide="left"
              onClick={() => {
                showSidebar(id, narrow);
              }}
            />
          );
        })}
        <IconButton
          label="Learn pages"
          icon={<BookOpen size={20} />}
          tooltipSide="left"
          aria-haspopup="dialog"
          onClick={() => {
            openModal('learnIndex');
          }}
        />
        <IconButton
          label="Alerts"
          icon={<Bell size={20} />}
          comingIn="a later phase"
          tooltipSide="left"
        />
        <IconButton
          label="Calendar"
          icon={<CalendarRange size={20} />}
          comingIn="a later phase"
          tooltipSide="left"
        />
      </div>
    </aside>
  );
}

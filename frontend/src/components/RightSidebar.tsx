import { Bell, CalendarRange, Layers, List } from 'lucide-react';

import { IconButton } from './IconButton.tsx';
import styles from './RightSidebar.module.css';
import { Watchlist } from './Watchlist.tsx';

interface RightSidebarProps {
  className?: string | undefined;
}

/** Watchlist panel plus the narrow widget bar on the far right. */
export function RightSidebar({ className }: RightSidebarProps) {
  return (
    <aside className={[styles.sidebar, className].join(' ')} aria-label="Watchlist and details">
      <section className={styles.panel} aria-labelledby="watchlist-title">
        <div className={styles.panelHeader}>
          <span id="watchlist-title">Watchlist</span>
        </div>
        <div className={styles.scroll}>
          <Watchlist />
        </div>
      </section>
      <div
        className={styles.widgetBar}
        role="toolbar"
        aria-label="Sidebar widgets"
        aria-orientation="vertical"
      >
        <IconButton label="Watchlist" icon={<List size={20} />} pressed tooltipSide="left" />
        <IconButton
          label="Alerts"
          icon={<Bell size={20} />}
          comingIn="a later phase"
          tooltipSide="left"
        />
        <IconButton
          label="Object tree and data window"
          icon={<Layers size={20} />}
          comingIn="R5"
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

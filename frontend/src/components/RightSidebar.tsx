import { Bell, CalendarRange, Layers, List } from 'lucide-react';
import { Fragment } from 'react';

import { IconButton } from './IconButton.tsx';
import styles from './RightSidebar.module.css';
import { DEFAULT_WATCHLIST } from './watchlist.ts';

interface RightSidebarProps {
  className?: string | undefined;
}

/** Watchlist panel plus the narrow widget bar on the far right. Quotes are wired in R2. */
export function RightSidebar({ className }: RightSidebarProps) {
  return (
    <aside className={[styles.sidebar, className].join(' ')} aria-label="Watchlist and details">
      <section className={styles.panel} aria-labelledby="watchlist-title">
        <div className={styles.panelHeader}>
          <span id="watchlist-title">Watchlist</span>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Last</th>
                <th scope="col">Chg</th>
                <th scope="col">Chg%</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_WATCHLIST.map((section) => (
                <Fragment key={section.title}>
                  <tr className={styles.section}>
                    <td colSpan={4}>{section.title}</td>
                  </tr>
                  {section.symbols.map(({ symbol, display }) => (
                    <tr key={symbol} className={styles.row} title={symbol}>
                      <td className={styles.symbol}>{display}</td>
                      <td className={styles.dash}>—</td>
                      <td className={styles.dash}>—</td>
                      <td className={styles.dash}>—</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
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

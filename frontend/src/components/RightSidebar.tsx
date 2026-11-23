import { Bell, CalendarRange, Layers, List } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from './IconButton.tsx';
import styles from './RightSidebar.module.css';
import { NARROW_QUERY, useMediaQuery } from './useMediaQuery.ts';
import { usePresence } from './usePresence.ts';
import { Watchlist } from './Watchlist.tsx';

interface RightSidebarProps {
  className?: string | undefined;
}

/**
 * Watchlist panel plus the narrow widget bar on the far right. On a wide window the panel is a
 * column (the Watchlist button collapses it); below 1100 px it floats over the chart, opened from
 * the button and closed with the button, Esc or a click outside.
 */
export function RightSidebar({ className }: RightSidebarProps) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const [docked, setDocked] = useState(true);
  const [floating, setFloating] = useState(false);
  const open = narrow ? floating : docked;
  const panel = usePresence(open ? true : null);
  const asideRef = useRef<HTMLElement>(null);

  // Floating: Esc or a click outside the sidebar closes it.
  useEffect(() => {
    if (!narrow || !floating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // An Esc that closed a dialog or panel first (they preventDefault) is not for us.
      if (event.key === 'Escape' && !event.defaultPrevented) setFloating(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !asideRef.current?.contains(event.target)) {
        setFloating(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [narrow, floating]);

  return (
    <aside
      ref={asideRef}
      className={[styles.sidebar, className].join(' ')}
      aria-label="Watchlist and details"
    >
      {panel.shown !== null && (
        <section
          className={[styles.panel, narrow ? styles.floating : ''].join(' ')}
          aria-labelledby="watchlist-title"
          data-closing={(narrow && panel.closing) || undefined}
          inert={panel.closing}
        >
          <div className={styles.panelHeader}>
            <span id="watchlist-title">Watchlist</span>
          </div>
          <div className={styles.scroll}>
            <Watchlist />
          </div>
        </section>
      )}
      <div
        className={styles.widgetBar}
        role="toolbar"
        aria-label="Sidebar widgets"
        aria-orientation="vertical"
      >
        <IconButton
          label={open ? 'Hide watchlist' : 'Show watchlist'}
          icon={<List size={20} />}
          pressed={open}
          tooltipSide="left"
          onClick={() => {
            if (narrow) setFloating(!floating);
            else setDocked(!docked);
          }}
        />
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

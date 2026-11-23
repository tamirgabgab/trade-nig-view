import {
  ChartArea,
  ChartCandlestick,
  ChartLine,
  ChartNoAxesGantt,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { CHART_TYPES, chartTypeLabel, type ChartType } from '../chart/chartTypes.ts';
import { useChartStore } from '../store/chartStore.ts';
import { IconButton } from './IconButton.tsx';
import styles from './ChartTypeMenu.module.css';
import { usePresence } from './usePresence.ts';

const ICONS: Record<ChartType, LucideIcon> = {
  candles: ChartCandlestick,
  hollow: ChartCandlestick,
  bars: ChartNoAxesGantt,
  line: ChartLine,
  area: ChartArea,
  heikin_ashi: ChartCandlestick,
};

const ICON_SIZE = 18;

/** Top-toolbar chart-type picker: a menu button with one radio item per chart type. */
export function ChartTypeMenu() {
  const chartType = useChartStore((s) => s.chartType);
  const setChartType = useChartStore((s) => s.setChartType);
  const [open, setOpen] = useState(false);
  const menu = usePresence(open ? true : null);
  const [active, setActive] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const Icon = ICONS[chartType];

  const trigger = () => wrapperRef.current?.querySelector<HTMLButtonElement>('button');

  const openMenu = () => {
    setActive(
      Math.max(
        CHART_TYPES.findIndex((t) => t.id === chartType),
        0,
      ),
    );
    setOpen(true);
  };

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger()?.focus();
  };

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const pick = (type: ChartType) => {
    setChartType(type);
    closeMenu(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = CHART_TYPES.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(active === last ? 0 : active + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(active === 0 ? last : active - 1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(last);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        closeMenu(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <IconButton
        label={`Chart type: ${chartTypeLabel(chartType)}`}
        icon={<Icon size={ICON_SIZE} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openMenu();
          }
        }}
      />
      {menu.shown && (
        <div
          id={menuId}
          {...menu.attrs}
          role="menu"
          aria-label="Chart type"
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          {CHART_TYPES.map((type, index) => {
            const ItemIcon = ICONS[type.id];
            return (
              <button
                key={type.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={type.id === chartType}
                tabIndex={index === active ? 0 : -1}
                className={styles.item}
                onMouseEnter={() => {
                  setActive(index);
                }}
                onClick={() => {
                  pick(type.id);
                }}
              >
                <ItemIcon size={16} aria-hidden="true" />
                <span className={styles.itemLabel}>{type.label}</span>
                {type.id === chartType && (
                  <Check size={14} aria-hidden="true" className={styles.check} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

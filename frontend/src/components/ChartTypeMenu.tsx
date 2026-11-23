import {
  ChartArea,
  ChartCandlestick,
  ChartLine,
  ChartNoAxesGantt,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';

import { CHART_TYPES, chartTypeLabel, type ChartType } from '../chart/chartTypes.ts';
import { useChartStore } from '../store/chartStore.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { IconButton } from './IconButton.tsx';
import styles from './ActionMenu.module.css';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const Icon = ICONS[chartType];

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) wrapperRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <IconButton
        label={`Chart type: ${chartTypeLabel(chartType)}`}
        icon={<Icon size={ICON_SIZE} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {menu.shown && (
        <ActionMenu
          key={menu.key}
          id={menuId}
          label="Chart type"
          attrs={menu.attrs}
          anchor={wrapperRef}
          initialActive={Math.max(
            CHART_TYPES.findIndex((t) => t.id === chartType),
            0,
          )}
          onClose={close}
          items={CHART_TYPES.map((type) => {
            const ItemIcon = ICONS[type.id];
            return {
              label: type.label,
              radio: true,
              checked: type.id === chartType,
              icon: <ItemIcon size={16} aria-hidden="true" />,
              onSelect: () => {
                setChartType(type.id);
              },
            };
          })}
        />
      )}
    </div>
  );
}

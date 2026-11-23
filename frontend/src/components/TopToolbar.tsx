import {
  BellPlus,
  Camera,
  ChartSpline,
  Maximize2,
  Plus,
  Redo2,
  Rewind,
  Save,
  Search,
  Settings,
  Undo2,
} from 'lucide-react';

import { useSymbols } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ChartTypeMenu } from './ChartTypeMenu.tsx';
import { IconButton } from './IconButton.tsx';
import { IntervalSwitcher } from './IntervalSwitcher.tsx';
import styles from './Toolbar.module.css';

const ICON_SIZE = 18;

interface TopToolbarProps {
  className?: string | undefined;
}

/** Top bar: symbol, interval, chart type, indicators, alert, replay, undo/redo, layout actions. */
export function TopToolbar({ className }: TopToolbarProps) {
  const symbol = useChartStore((s) => s.symbol);
  const display = useSymbols().data?.find((s) => s.symbol === symbol)?.display ?? symbol;
  const openSymbolSearch = useUiStore((s) => s.openSymbolSearch);
  const setIndicatorsDialog = useUiStore((s) => s.setIndicatorsDialog);
  return (
    <header className={[styles.bar, className].join(' ')} role="toolbar" aria-label="Chart toolbar">
      <button
        type="button"
        className={styles.symbolButton}
        aria-label={`Symbol search: ${display}`}
        aria-haspopup="dialog"
        title="Symbol search (or just start typing a ticker)"
        onClick={() => {
          openSymbolSearch();
        }}
      >
        <Search size={16} aria-hidden="true" />
        {display}
      </button>
      <IconButton
        label="Compare or add symbol"
        icon={<Plus size={ICON_SIZE} />}
        comingIn="a later round"
      />
      <span className={styles.separator} aria-hidden="true" />
      <IntervalSwitcher />
      <span className={styles.separator} aria-hidden="true" />
      <ChartTypeMenu />
      <IconButton
        label="Indicators"
        text="Indicators"
        shortcut="/"
        icon={<ChartSpline size={ICON_SIZE} />}
        aria-haspopup="dialog"
        onClick={() => {
          setIndicatorsDialog(true);
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Create alert"
        text="Alert"
        icon={<BellPlus size={ICON_SIZE} />}
        comingIn="a later phase"
      />
      <IconButton
        label="Bar replay"
        text="Replay"
        icon={<Rewind size={ICON_SIZE} />}
        comingIn="R7"
      />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton label="Undo" shortcut="Ctrl+Z" icon={<Undo2 size={ICON_SIZE} />} comingIn="R6" />
      <IconButton label="Redo" shortcut="Ctrl+Y" icon={<Redo2 size={ICON_SIZE} />} comingIn="R6" />
      <span className={styles.spacer} />
      <span className={styles.layoutName}>Unnamed</span>
      <IconButton
        label="Save layout"
        tooltipSide="bottom-end"
        icon={<Save size={ICON_SIZE} />}
        comingIn="R6"
      />
      <IconButton
        label="Chart settings"
        tooltipSide="bottom-end"
        icon={<Settings size={ICON_SIZE} />}
        comingIn="R6"
      />
      <IconButton
        label="Fullscreen"
        tooltipSide="bottom-end"
        icon={<Maximize2 size={ICON_SIZE} />}
        comingIn="R6"
      />
      <IconButton
        label="Take a snapshot"
        icon={<Camera size={ICON_SIZE} />}
        comingIn="R6"
        tooltipSide="left"
      />
    </header>
  );
}

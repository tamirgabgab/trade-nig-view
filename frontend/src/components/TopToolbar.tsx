import {
  BellPlus,
  ChartSpline,
  Keyboard,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  Redo2,
  Rewind,
  Search,
  Settings,
  Sun,
  Undo2,
} from 'lucide-react';

import { useSymbols } from '../api/market.ts';
import { MAX_COMPARE, useChartStore } from '../store/chartStore.ts';
import { useHistoryStore } from '../store/historyStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { isLightTheme, useThemeStore } from '../store/themeStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ChartTypeMenu } from './ChartTypeMenu.tsx';
import { IconButton } from './IconButton.tsx';
import { IntervalSwitcher } from './IntervalSwitcher.tsx';
import { MinuteIntervalMenu } from './MinuteIntervalMenu.tsx';
import { LayoutMenu } from './LayoutMenu.tsx';
import { useFullscreen } from './useFullscreen.ts';
import { SnapshotMenu } from './SnapshotMenu.tsx';
import { StructureMenu } from './StructureMenu.tsx';
import styles from './Toolbar.module.css';

const ICON_SIZE = 18;

interface TopToolbarProps {
  className?: string | undefined;
}

/** Top bar: symbol, interval, chart type, indicators, alert, replay, undo/redo, layout actions. */
export function TopToolbar({ className }: TopToolbarProps) {
  const symbol = useChartStore((s) => s.symbol);
  const display = useSymbols().data?.find((s) => s.symbol === symbol)?.display ?? symbol;
  const openModal = useUiStore((s) => s.openModal);
  const theme = useThemeStore((s) => s.theme);
  const compareFull = useChartStore((s) => s.compare.length >= MAX_COMPARE);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const fullscreen = useFullscreen();
  const replaying = useReplayStore((s) => s.mode !== 'off');
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  return (
    <header className={[styles.bar, className].join(' ')} role="toolbar" aria-label="Chart toolbar">
      <button
        type="button"
        className={styles.symbolButton}
        aria-label={`Symbol search: ${display}`}
        aria-haspopup="dialog"
        title="Symbol search (or just start typing a ticker)"
        onClick={() => {
          openModal('symbols');
        }}
      >
        <Search size={16} aria-hidden="true" />
        {display}
      </button>
      <IconButton
        label="Compare with another symbol"
        icon={<Plus size={ICON_SIZE} />}
        aria-haspopup="dialog"
        disabled={compareFull}
        onClick={() => {
          openModal('compare');
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <MinuteIntervalMenu />
      <IntervalSwitcher />
      <span className={styles.separator} aria-hidden="true" />
      <ChartTypeMenu />
      <IconButton
        label="Add indicator"
        text="Indicators"
        shortcut="/"
        icon={<ChartSpline size={ICON_SIZE} />}
        aria-haspopup="dialog"
        onClick={() => {
          openModal('indicators');
        }}
      />
      <StructureMenu />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Create alert"
        text="Alert"
        icon={<BellPlus size={ICON_SIZE} />}
        comingIn="a later phase"
      />
      <IconButton
        label={replaying ? 'Exit bar replay' : 'Bar replay'}
        text="Replay"
        icon={<Rewind size={ICON_SIZE} />}
        pressed={replaying}
        onClick={() => {
          if (replaying) useReplayStore.getState().exit();
          else useReplayStore.getState().start(symbol);
        }}
      />
      <span className={styles.separator} aria-hidden="true" />
      <IconButton
        label="Undo"
        shortcut="Ctrl+Z"
        icon={<Undo2 size={ICON_SIZE} />}
        disabled={!canUndo}
        onClick={undo}
      />
      <IconButton
        label="Redo"
        shortcut="Ctrl+Y"
        icon={<Redo2 size={ICON_SIZE} />}
        disabled={!canRedo}
        onClick={redo}
      />
      <span className={styles.spacer} />
      <LayoutMenu />
      <IconButton
        label={isLightTheme(theme) ? 'Switch to dark theme' : 'Switch to light theme'}
        tooltipSide="bottom-end"
        icon={isLightTheme(theme) ? <Moon size={ICON_SIZE} /> : <Sun size={ICON_SIZE} />}
        onClick={toggleTheme}
      />
      <IconButton
        label="Show keyboard shortcuts"
        shortcut="?"
        tooltipSide="bottom-end"
        icon={<Keyboard size={ICON_SIZE} />}
        aria-haspopup="dialog"
        onClick={() => {
          openModal('shortcuts');
        }}
      />
      <IconButton
        label="Open chart settings"
        tooltipSide="bottom-end"
        icon={<Settings size={ICON_SIZE} />}
        aria-haspopup="dialog"
        onClick={() => {
          openModal('settings');
        }}
      />
      <IconButton
        label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        tooltipSide="bottom-end"
        icon={fullscreen ? <Minimize2 size={ICON_SIZE} /> : <Maximize2 size={ICON_SIZE} />}
        onClick={() => {
          void (
            fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen()
          ).catch(() => undefined);
        }}
      />
      <SnapshotMenu />
    </header>
  );
}

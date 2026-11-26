import { useEffect, useLayoutEffect } from 'react';

import styles from './App.module.css';
import { BottomBar } from './components/BottomBar.tsx';
import { ChartArea } from './components/ChartArea.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { DrawingToolbar } from './components/DrawingToolbar.tsx';
import { IndicatorsDialog } from './components/IndicatorsDialog.tsx';
import { LayoutDialogs } from './components/LayoutDialogs.tsx';
import { LearnIndexDialog } from './components/LearnIndexDialog.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { SymbolSearchDialog } from './components/SymbolSearchDialog.tsx';
import { TopToolbar } from './components/TopToolbar.tsx';
import { PlannerPage } from './planner/PlannerPage.tsx';
import { useAppHotkeys } from './components/useAppHotkeys.ts';
import { recordHistory } from './store/historyStore.ts';
import { startLayoutSync } from './store/layoutSync.ts';
import { useSettingsStore } from './store/settingsStore.ts';
import { useThemeStore } from './store/themeStore.ts';
import { useUiStore } from './store/uiStore.ts';

/** Application shell: five regions laid out like a desktop charting terminal. */
export function App() {
  const theme = useThemeStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const textScale = useSettingsStore((s) => s.textScale);
  const view = useUiStore((s) => s.view);
  // Before paint, so the chart (a child) reads the new tokens when it repaints.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    root.dataset['accent'] = accent;
    root.style.setProperty('--text-scale', String(textScale));
  }, [theme, accent, textScale]);
  useAppHotkeys();
  // Undo/redo records every chart change from here on.
  useEffect(() => recordHistory(), []);
  // The open layout is loaded from the backend, then saved after every change.
  useEffect(() => startLayoutSync(), []);
  return (
    <div className={styles.shell}>
      <TopToolbar className={styles.top} />
      <DrawingToolbar className={styles.left} />
      <ChartArea className={styles.chart} />
      <RightSidebar className={styles.right} />
      <BottomBar className={styles.bottom} />
      {/* Over the chart, which stays mounted (its state and data survive the visit). */}
      {view === 'planner' && <PlannerPage className={styles.planner} />}
      <SymbolSearchDialog />
      <IndicatorsDialog />
      <ShortcutsDialog />
      <CommandPalette />
      <SettingsDialog />
      <LayoutDialogs />
      <LearnIndexDialog />
    </div>
  );
}

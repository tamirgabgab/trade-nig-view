import { useEffect, useLayoutEffect } from 'react';

import styles from './App.module.css';
import { BottomBar } from './components/BottomBar.tsx';
import { ChartArea } from './components/ChartArea.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { DrawingToolbar } from './components/DrawingToolbar.tsx';
import { IndicatorsDialog } from './components/IndicatorsDialog.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { SymbolSearchDialog } from './components/SymbolSearchDialog.tsx';
import { TopToolbar } from './components/TopToolbar.tsx';
import { useAppHotkeys } from './components/useAppHotkeys.ts';
import { recordHistory } from './store/historyStore.ts';
import { useThemeStore } from './store/themeStore.ts';

/** Application shell: five regions laid out like a desktop charting terminal. */
export function App() {
  const theme = useThemeStore((s) => s.theme);
  // Before paint, so the chart (a child) reads the new tokens when it repaints.
  useLayoutEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useAppHotkeys();
  // Undo/redo records every chart change from here on.
  useEffect(() => recordHistory(), []);
  return (
    <div className={styles.shell}>
      <TopToolbar className={styles.top} />
      <DrawingToolbar className={styles.left} />
      <ChartArea className={styles.chart} />
      <RightSidebar className={styles.right} />
      <BottomBar className={styles.bottom} />
      <SymbolSearchDialog />
      <IndicatorsDialog />
      <ShortcutsDialog />
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}

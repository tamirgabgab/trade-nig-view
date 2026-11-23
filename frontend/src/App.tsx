import { useLayoutEffect } from 'react';

import styles from './App.module.css';
import { BottomBar } from './components/BottomBar.tsx';
import { ChartArea } from './components/ChartArea.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { DrawingToolbar } from './components/DrawingToolbar.tsx';
import { IndicatorsDialog } from './components/IndicatorsDialog.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { SymbolSearchDialog } from './components/SymbolSearchDialog.tsx';
import { TopToolbar } from './components/TopToolbar.tsx';
import { useCommandPaletteHotkey } from './components/useCommandPaletteHotkey.ts';
import { useIndicatorsHotkey } from './components/useIndicatorsHotkey.ts';
import { useShortcutsHotkey } from './components/useShortcutsHotkey.ts';
import { useSymbolSearchHotkey } from './components/useSymbolSearchHotkey.ts';
import { useThemeStore } from './store/themeStore.ts';

/** Application shell: five regions laid out like a desktop charting terminal. */
export function App() {
  const theme = useThemeStore((s) => s.theme);
  // Before paint, so the chart (a child) reads the new tokens when it repaints.
  useLayoutEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  useSymbolSearchHotkey();
  useIndicatorsHotkey();
  useShortcutsHotkey();
  useCommandPaletteHotkey();
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
    </div>
  );
}

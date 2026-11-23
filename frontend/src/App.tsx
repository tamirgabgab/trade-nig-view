import styles from './App.module.css';
import { BottomBar } from './components/BottomBar.tsx';
import { ChartArea } from './components/ChartArea.tsx';
import { DrawingToolbar } from './components/DrawingToolbar.tsx';
import { IndicatorsDialog } from './components/IndicatorsDialog.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.tsx';
import { SymbolSearchDialog } from './components/SymbolSearchDialog.tsx';
import { TopToolbar } from './components/TopToolbar.tsx';
import { useIndicatorsHotkey } from './components/useIndicatorsHotkey.ts';
import { useShortcutsHotkey } from './components/useShortcutsHotkey.ts';
import { useSymbolSearchHotkey } from './components/useSymbolSearchHotkey.ts';

/** Application shell: five regions laid out like a desktop charting terminal. */
export function App() {
  useSymbolSearchHotkey();
  useIndicatorsHotkey();
  useShortcutsHotkey();
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
    </div>
  );
}

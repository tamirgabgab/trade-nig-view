import styles from './App.module.css';
import { BottomBar } from './components/BottomBar.tsx';
import { ChartArea } from './components/ChartArea.tsx';
import { DrawingToolbar } from './components/DrawingToolbar.tsx';
import { RightSidebar } from './components/RightSidebar.tsx';
import { TopToolbar } from './components/TopToolbar.tsx';

/** Application shell: five regions laid out like a desktop charting terminal. */
export function App() {
  return (
    <div className={styles.shell}>
      <TopToolbar className={styles.top} />
      <DrawingToolbar className={styles.left} />
      <ChartArea className={styles.chart} />
      <RightSidebar className={styles.right} />
      <BottomBar className={styles.bottom} />
    </div>
  );
}

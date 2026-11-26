import type { ReactNode } from 'react';

import { LearnLink } from '../components/LearnLink.tsx';
import styles from './Planner.module.css';

/** A line under a section of the planner that opens the learn page explaining it. */
export function PlannerLearn({ page, children }: { page: string; children: ReactNode }) {
  return (
    <p className={styles.note}>
      Explained, with the formulas, in <LearnLink target={page}>{children}</LearnLink>.
    </p>
  );
}

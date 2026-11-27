import { useState, type ReactNode } from 'react';

import styles from './Planner.module.css';

interface PlannerFoldProps {
  title: string;
  /** What the section holds, shown beside the title: what will run while it is folded. */
  state: string;
  initiallyOpen: boolean;
  children: ReactNode;
}

/** A section of a form that folds, its summary saying what it holds. */
export function PlannerFold({ title, state, initiallyOpen, children }: PlannerFoldProps) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className={[styles.section, styles.fold].join(' ')}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span className={styles.foldTitle}>{title}</span>
        <span className={styles.foldState}>{state}</span>
      </summary>
      {children}
    </details>
  );
}

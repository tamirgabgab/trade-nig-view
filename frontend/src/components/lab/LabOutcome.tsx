import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { LabResult } from '../../api/lab.ts';
import styles from './Lab.module.css';

/** A lab query's error or loading line, else what `children` draws from the result. */
export function LabOutcome({
  lab,
  children,
}: {
  lab: UseQueryResult<LabResult>;
  children: (data: LabResult) => ReactNode;
}) {
  if (lab.isError) {
    return (
      <p className={styles.error} role="alert">
        Could not compute: {lab.error.message}
      </p>
    );
  }
  if (lab.data === undefined) return <p className={styles.note}>Computing…</p>;
  return children(lab.data);
}

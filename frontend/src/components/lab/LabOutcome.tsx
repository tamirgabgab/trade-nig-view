import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { LabResult } from '../../api/lab.ts';
import styles from './Lab.module.css';

/** A lab query's error or loading line, else what `children` draws from the result. `missing`:
 *  why the lab cannot run at all (its query then never starts). */
export function LabOutcome({
  lab,
  missing = null,
  children,
}: {
  lab: UseQueryResult<LabResult>;
  missing?: string | null;
  children: (data: LabResult) => ReactNode;
}) {
  if (missing !== null) {
    return (
      <p className={styles.error} role="alert">
        {missing}
      </p>
    );
  }
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

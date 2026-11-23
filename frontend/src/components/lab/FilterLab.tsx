import { useIndicatorList, type Params } from '../../api/indicators.ts';
import { FilterView } from '../FilterView.tsx';
import styles from './Lab.module.css';
import { missingIndicator, withDefaults } from './labModel.ts';

export interface FilterBlock {
  kind: 'filter';
  indicator: string;
  params?: Params;
  /** The output shown first, e.g. "macd" (default: the first measured one). */
  output?: string;
}

/** A page's figure of a linear indicator: the Filter view (impulse, step, frequency response,
 *  lag and noise), measured on the real implementation. */
export function FilterLab({ block }: { block: FilterBlock }) {
  const registry = useIndicatorList();
  const spec = registry.data?.find((s) => s.id === block.indicator);
  const missing = missingIndicator(registry, spec, block.indicator);
  if (missing !== null) {
    return (
      <p className={styles.error} role="alert">
        {missing}
      </p>
    );
  }
  if (spec === undefined) return <p className={styles.note}>Loading…</p>;
  return (
    <section className={styles.lab} aria-label={`${spec.shortName}: filter view`}>
      <FilterView spec={spec} params={withDefaults(spec, block.params)} output={block.output} />
    </section>
  );
}

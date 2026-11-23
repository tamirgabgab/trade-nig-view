import { BookOpen, Eye, EyeOff, Settings2, TriangleAlert, X } from 'lucide-react';

import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { formatPrice } from './formatNumber.ts';
import { IconButton } from './IconButton.tsx';
import styles from './IndicatorLegend.module.css';
import type { IndicatorView } from './useChartIndicators.ts';

const ICON = 14;

interface IndicatorLegendProps {
  views: readonly IndicatorView[];
  /** Bar under the crosshair; null shows the latest bar's values. */
  hoverIndex: number | null;
  barCount: number;
  decimals: number;
}

/** One row per indicator under the price legend: label, values at the crosshair and actions. */
export function IndicatorLegend({ views, hoverIndex, barCount, decimals }: IndicatorLegendProps) {
  const toggleVisible = useIndicatorStore((s) => s.toggleVisible);
  const remove = useIndicatorStore((s) => s.remove);
  const openSettings = useUiStore((s) => s.openSettings);
  const settingsFor = useUiStore((s) => s.settingsFor);
  if (views.length === 0) return null;
  const index = hoverIndex ?? barCount - 1;

  return (
    <ul className={styles.list} aria-label="Indicators on the chart">
      {views.map((view) => {
        const { uid, visible } = view.instance;
        return (
          <li
            key={uid}
            className={[styles.row, visible ? '' : styles.hidden].join(' ')}
            data-indicator={uid}
          >
            <span className={styles.label}>{view.label}</span>
            {visible &&
              view.outputs
                .filter((output) => output.plot !== 'markers')
                .map((output) => {
                  const value = output.values[index];
                  return (
                    <span
                      key={output.name}
                      className={styles.value}
                      style={{ color: output.color }}
                      data-output={output.name}
                    >
                      {value === null || value === undefined ? '—' : formatPrice(value, decimals)}
                    </span>
                  );
                })}
            {view.error !== null && (
              <span className={styles.error} role="alert" title={view.error.message}>
                <TriangleAlert size={ICON} aria-hidden="true" />
                <span className={styles.errorText}>{view.error.message}</span>
              </span>
            )}
            {view.spec === undefined && view.error === null && (
              <span className={styles.note}>Unavailable</span>
            )}
            <span className={styles.actions}>
              <IconButton
                className={styles.action}
                label={visible ? `Hide ${view.label}` : `Show ${view.label}`}
                icon={visible ? <Eye size={ICON} /> : <EyeOff size={ICON} />}
                onClick={() => {
                  toggleVisible(uid);
                }}
              />
              <IconButton
                className={styles.action}
                label={`Settings: ${view.label}`}
                icon={<Settings2 size={ICON} />}
                pressed={settingsFor === uid}
                disabled={view.spec === undefined}
                onClick={() => {
                  openSettings(settingsFor === uid ? null : uid);
                }}
              />
              <IconButton
                className={styles.action}
                label={`Learn: ${view.spec?.name ?? view.label}`}
                icon={<BookOpen size={ICON} />}
                comingIn="L1"
              />
              <IconButton
                className={styles.action}
                label={`Remove ${view.label}`}
                icon={<X size={ICON} />}
                onClick={() => {
                  if (settingsFor === uid) openSettings(null);
                  remove(uid);
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

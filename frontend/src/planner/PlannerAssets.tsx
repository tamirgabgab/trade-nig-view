import { Plus, X } from 'lucide-react';

import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerStore, type PlannerAsset } from '../store/plannerStore.ts';
import styles from './Planner.module.css';
import { PlannerNumber } from './PlannerNumber.tsx';

const NEW_ASSET: PlannerAsset = { symbol: '', weight: 10, currency: 'USD', dividendYield: 0 };

/** The mix: any Yahoo ticker with its weight, currency and (for a price index) dividend yield. */
export function PlannerAssets() {
  const assets = usePlannerStore((s) => s.form.assets);
  const useFx = usePlannerStore((s) => s.form.useFx);
  const update = usePlannerStore((s) => s.update);
  const change = (index: number, changes: Partial<PlannerAsset>) => {
    update({ assets: assets.map((a, i) => (i === index ? { ...a, ...changes } : a)) });
  };
  return (
    <fieldset className={styles.section}>
      <legend>Assets</legend>
      <table className={`${styles.rows} ${styles.assets}`}>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Weight</th>
            <th>Currency</th>
            <th title="Assumed yearly dividend yield, for a price index such as ^GSPC">Yield %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset, index) => (
            <tr key={index}>
              <td>
                <input
                  className={panel.control}
                  aria-label={`Ticker ${String(index + 1)}`}
                  value={asset.symbol}
                  maxLength={20}
                  spellCheck={false}
                  placeholder="e.g. SPY"
                  onChange={(event) => {
                    change(index, { symbol: event.target.value.toUpperCase() });
                  }}
                />
              </td>
              <td>
                <PlannerNumber
                  label={`Weight ${String(index + 1)}`}
                  value={asset.weight}
                  min={0.01}
                  max={100_000}
                  onChange={(weight) => {
                    change(index, { weight });
                  }}
                />
              </td>
              <td>
                <select
                  className={panel.control}
                  aria-label={`Currency ${String(index + 1)}`}
                  value={asset.currency}
                  onChange={(event) => {
                    change(index, { currency: event.target.value === 'ILS' ? 'ILS' : 'USD' });
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="ILS">ILS</option>
                </select>
              </td>
              <td>
                <PlannerNumber
                  label={`Dividend yield ${String(index + 1)}`}
                  value={asset.dividendYield}
                  max={100}
                  step={0.1}
                  onChange={(dividendYield) => {
                    change(index, { dividendYield });
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove asset ${String(index + 1)}`}
                  disabled={assets.length === 1}
                  onClick={() => {
                    update({ assets: assets.filter((_, i) => i !== index) });
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={panel.secondary}
        onClick={() => {
          update({ assets: [...assets, NEW_ASSET] });
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Add asset
      </button>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={useFx}
          onChange={(event) => {
            update({ useFx: event.target.checked });
          }}
        />
        Convert dollar assets by the USD/ILS rate
      </label>
    </fieldset>
  );
}

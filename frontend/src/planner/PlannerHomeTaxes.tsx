import type { BettermentSpec } from '../api/planner.ts';
import panel from '../components/IndicatorSettingsPanel.module.css';
import { usePlannerHomeStore } from '../store/plannerHomeStore.ts';
import styles from './Planner.module.css';
import { PlannerBrackets } from './PlannerBrackets.tsx';
import { PlannerField } from './PlannerField.tsx';
import { PlannerPreset } from './PlannerPreset.tsx';
import { useHomeTaxes } from './useHomeTaxes.ts';

/** The purchase-tax table and the betterment tax: built-in tables, editable and saveable. */
export function PlannerHomeTaxes() {
  const purchaseTax = usePlannerHomeStore((s) => s.home.purchaseTax);
  const betterment = usePlannerHomeStore((s) => s.home.betterment);
  const saved = usePlannerHomeStore((s) => s.saved);
  const { update, savePurchaseTax, saveBetterment, deleteSaved } = usePlannerHomeStore.getState();
  const { presets, failed, taxes } = useHomeTaxes();
  if (taxes === null) {
    return (
      <fieldset className={styles.section}>
        <legend>Taxes</legend>
        <p className={failed ? styles.error : styles.note} role={failed ? 'alert' : undefined}>
          {failed
            ? 'The tax tables could not be loaded. Check that the backend runs, then reload.'
            : 'Loading the tax tables…'}
        </p>
      </fieldset>
    );
  }
  const spec = taxes.betterment;
  const setSpec = (changes: Partial<BettermentSpec>) => {
    update({ betterment: { ...betterment, edited: { ...spec, ...changes } } });
  };
  const custom = (spec.brackets ?? []).length > 0;
  return (
    <>
      <fieldset className={styles.section}>
        <legend>Purchase tax</legend>
        <PlannerPreset
          label="Purchase tax"
          preset={purchaseTax.preset}
          edited={purchaseTax.edited !== null}
          builtIn={presets?.purchase ?? []}
          saved={Object.keys(saved.purchase)}
          allowNone
          onPick={(preset) => {
            update({ purchaseTax: { preset, edited: null } });
          }}
          onSave={(name) => {
            savePurchaseTax(name, taxes.purchase);
          }}
          onDelete={(name) => {
            deleteSaved('purchase', name);
          }}
        />
        <PlannerBrackets
          label="Purchase tax"
          rows={taxes.purchase}
          onChange={(rows) => {
            update({ purchaseTax: { ...purchaseTax, edited: rows } });
          }}
        />
        {presets !== undefined && (
          <p className={styles.note}>
            Built-in tables as of {presets.as_of}. {presets.source}. Defaults, not tax advice.
          </p>
        )}
      </fieldset>
      <fieldset className={styles.section}>
        <legend>Betterment tax (at the sale)</legend>
        <PlannerPreset
          label="Betterment tax"
          preset={betterment.preset}
          edited={betterment.edited !== null}
          builtIn={presets?.betterment ?? []}
          saved={Object.keys(saved.betterment)}
          onPick={(preset) => {
            update({ betterment: { preset, edited: null } });
          }}
          onSave={(name) => {
            saveBetterment(name, spec);
          }}
          onDelete={(name) => {
            deleteSaved('betterment', name);
          }}
        />
        <div className={styles.grid}>
          <PlannerField
            label="Betterment tax rate %"
            text="Rate % of the real gain"
            value={spec.rate_pct}
            max={100}
            step={0.5}
            disabled={custom}
            onChange={(rate_pct) => {
              setSpec({ rate_pct });
            }}
          />
          <PlannerField
            label="Exemption ceiling ₪"
            value={spec.ceiling}
            min={1}
            step={1000}
            disabled={custom || !spec.single_home}
            onChange={(ceiling) => {
              setSpec({ ceiling });
            }}
          />
          <label className={`${panel.check} ${styles.wide}`}>
            <input
              type="checkbox"
              checked={spec.single_home}
              disabled={custom}
              onChange={(event) => {
                setSpec({ single_home: event.target.checked });
              }}
            />
            Single home: exempt up to the ceiling
          </label>
          <label className={`${panel.check} ${styles.wide}`}>
            <input
              type="checkbox"
              checked={spec.linear}
              disabled={custom}
              onChange={(event) => {
                setSpec({ linear: event.target.checked });
              }}
            />
            Linear split: the gain’s share before 2014 is exempt
          </label>
        </div>
        <p className={styles.note}>
          The real gain is the sale, less its costs, less the price and the purchase costs indexed
          by the CPI. Brackets, if you add any, are applied to that gain in place of the rate, the
          exemption and the linear split.
        </p>
        <PlannerBrackets
          label="Betterment tax"
          rows={spec.brackets ?? []}
          onChange={(brackets) => {
            setSpec({ brackets });
          }}
        />
      </fieldset>
    </>
  );
}

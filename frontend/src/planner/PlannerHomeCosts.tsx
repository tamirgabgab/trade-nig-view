import { usePlannerHomeStore, type HomeForm } from '../store/plannerHomeStore.ts';
import styles from './Planner.module.css';
import { PlannerField } from './PlannerField.tsx';
import { PlannerSelect } from './PlannerSelect.tsx';

const RENT_MODES = [
  ['live', 'I live in it (the rent I save)'],
  ['rent_out', 'Rented out (income)'],
  ['none', 'Not counted'],
] as const;

const RENT_GROWTH = [
  ['cpi', 'With the CPI'],
  ['value', 'With the apartment’s value'],
  ['fixed', 'A fixed rate'],
] as const;

/** The rent the apartment saves or earns, and what buying, owning and selling it costs. */
export function PlannerHomeCosts() {
  const rent = usePlannerHomeStore((s) => s.home.rent);
  const costs = usePlannerHomeStore((s) => s.home.costs);
  const update = usePlannerHomeStore((s) => s.update);
  const setRent = (changes: Partial<HomeForm['rent']>) => {
    update({ rent: { ...rent, ...changes } });
  };
  const setCosts = (changes: Partial<HomeForm['costs']>) => {
    update({ costs: { ...costs, ...changes } });
  };
  const rented = rent.mode === 'rent_out';
  return (
    <>
      <fieldset className={styles.section}>
        <legend>Rent</legend>
        <div className={styles.grid}>
          <PlannerSelect
            label="Rent"
            className={styles.wide}
            value={rent.mode}
            options={RENT_MODES}
            onChange={(mode) => {
              setRent({ mode });
            }}
          />
          <PlannerField
            label="Rent ₪ a month"
            value={rent.monthly}
            step={100}
            disabled={rent.mode === 'none'}
            onChange={(monthly) => {
              setRent({ monthly });
            }}
          />
          <PlannerSelect
            label="Rent grows"
            value={rent.growth}
            options={RENT_GROWTH}
            disabled={rent.mode === 'none'}
            onChange={(growth) => {
              setRent({ growth });
            }}
          />
          <PlannerField
            label="Rent growth % a year"
            value={rent.growthPct}
            min={-20}
            max={50}
            step={0.1}
            disabled={rent.mode === 'none' || rent.growth !== 'fixed'}
            onChange={(growthPct) => {
              setRent({ growthPct });
            }}
          />
          <PlannerField
            label="Vacancy %"
            value={rent.vacancy}
            max={100}
            step={0.5}
            disabled={!rented}
            onChange={(vacancy) => {
              setRent({ vacancy });
            }}
          />
          <PlannerField
            label="Tax on the rent %"
            value={rent.tax}
            max={100}
            step={0.5}
            disabled={!rented}
            onChange={(tax) => {
              setRent({ tax });
            }}
          />
        </div>
      </fieldset>
      <fieldset className={styles.section}>
        <legend>Costs</legend>
        <div className={styles.grid}>
          <PlannerField
            label="Lawyer % of the price"
            value={costs.lawyer}
            max={100}
            step={0.1}
            onChange={(lawyer) => {
              setCosts({ lawyer });
            }}
          />
          <PlannerField
            label="Broker at the purchase %"
            value={costs.broker}
            max={100}
            step={0.1}
            onChange={(broker) => {
              setCosts({ broker });
            }}
          />
          <PlannerField
            label="Renovation ₪"
            value={costs.renovation}
            step={1000}
            onChange={(renovation) => {
              setCosts({ renovation });
            }}
          />
          <PlannerField
            label="Maintenance % of the value a year"
            value={costs.maintenance}
            max={100}
            step={0.1}
            onChange={(maintenance) => {
              setCosts({ maintenance });
            }}
          />
          <PlannerField
            label="Insurance ₪ a year"
            value={costs.insurance}
            step={100}
            onChange={(insurance) => {
              setCosts({ insurance });
            }}
          />
          <PlannerField
            label="Selling costs %"
            value={costs.selling}
            max={100}
            step={0.1}
            onChange={(selling) => {
              setCosts({ selling });
            }}
          />
          <PlannerField
            label="Early-repayment fee % of the balance"
            value={costs.earlyRepayment}
            max={100}
            step={0.1}
            onChange={(earlyRepayment) => {
              setCosts({ earlyRepayment });
            }}
          />
        </div>
      </fieldset>
    </>
  );
}

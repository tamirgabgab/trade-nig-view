import styles from './Planner.module.css';

/** A result: its label, its value, and a note shown on hover. */
export type PlannerCard = [label: string, value: string, note?: string];

export function PlannerCards({ cards }: { cards: PlannerCard[] }) {
  return (
    <dl className={styles.cards}>
      {cards.map(([label, value, note]) => (
        <div key={label} className={styles.card} title={note}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

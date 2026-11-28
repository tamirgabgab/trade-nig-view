import type { RulesStrategy } from '../api/strategies.ts';
import f from './ForecastPanel.module.css';
import styles from './StrategyPanel.module.css';
import { exitsText, groupsText } from './strategyText.ts';

/** A rules strategy in words (P4 B0); the rule builder replaces it in B2. */
export function StrategyRules({ strategy }: { strategy: RulesStrategy }) {
  const ind = strategy.indicators ?? [];
  const side = (label: string, rules: RulesStrategy['long']) => {
    const entry = groupsText(rules?.entry ?? [], ind);
    const exit = groupsText(rules?.exit ?? [], ind);
    return (
      <>
        <p className={styles.side}>{label}</p>
        {entry.length === 0 ? (
          <p className={f.note}>No entries.</p>
        ) : (
          <ul className={styles.rules} aria-label={`${label} rules`}>
            {entry.map((text, i) => (
              <li key={`e${String(i)}`}>{`${i > 0 ? 'or ' : ''}enter when ${text}`}</li>
            ))}
            {exit.map((text, i) => (
              <li key={`x${String(i)}`}>{`${i > 0 ? 'or ' : ''}exit when ${text}`}</li>
            ))}
          </ul>
        )}
      </>
    );
  };
  const filters = groupsText(strategy.filters ?? [], ind);
  const exits = exitsText(strategy.exits);
  return (
    <>
      {side('Long', strategy.long)}
      {side('Short', strategy.short)}
      {filters.length > 0 && <p className={f.note}>Entries only while {filters.join(', or ')}.</p>}
      {exits.length > 0 && <p className={f.note}>Also exits {exits.join(', ')}.</p>}
    </>
  );
}

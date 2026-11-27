import styles from './SyntheticBadge.module.css';

/** "SYN" next to a synthetic symbol's ticker, wherever it is listed: an invented series. */
export function SyntheticBadge() {
  return (
    <span className={styles.badge} role="img" aria-label="Synthetic">
      SYN
    </span>
  );
}

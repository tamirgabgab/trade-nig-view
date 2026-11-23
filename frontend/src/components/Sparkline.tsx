import styles from './Sparkline.module.css';

const WIDTH = 36;
const HEIGHT = 16;

/** Tiny line of recent closes, green when the last is above the first, red when below. */
export function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * WIDTH;
      const y = HEIGHT - 1 - ((v - low) / span) * (HEIGHT - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const tone = last > first ? styles.up : last < first ? styles.down : styles.flat;
  return (
    <svg
      className={[styles.spark, tone].join(' ')}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      aria-hidden="true"
    >
      <polyline points={points} />
    </svg>
  );
}

import styles from './TradePlanHeat.module.css';

const PROFIT = '8 153 129';
const LOSS = '242 54 69';

/**
 * The EV heat map: the expected result in R for each target (columns) and stop (rows) distance,
 * in multiples of the horizon's typical move sigma x sqrt(h); green above 0, red below, the
 * drawn plan's nearest cell outlined.
 */
export function TradePlanHeat({
  multiples,
  heat,
  current,
}: {
  multiples: number[];
  heat: (number | null)[][];
  /** The drawn plan's [stop, target] distances in the same units. */
  current: [number, number];
}) {
  const nearest = (v: number) =>
    multiples.reduce(
      (best, m, i) => (Math.abs(m - v) < Math.abs((multiples[best] ?? 0) - v) ? i : best),
      0,
    );
  const [row, col] = [nearest(current[0]), nearest(current[1])];
  const top = Math.max(0.25, ...heat.flat().map((v) => Math.abs(v ?? 0)));

  return (
    <table className={styles.heat} aria-label="Expected R by target and stop distance">
      <thead>
        <tr>
          <th scope="col" className={styles.axis}>
            stop \ target
          </th>
          {multiples.map((m) => (
            <th key={m} scope="col">
              {m}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {heat.map((cells, i) => (
          <tr key={multiples[i]}>
            <th scope="row">{multiples[i]}</th>
            {cells.map((v, j) => (
              <td
                key={multiples[j]}
                aria-current={i === row && j === col}
                style={{
                  background:
                    v === null
                      ? undefined
                      : `rgb(${v >= 0 ? PROFIT : LOSS} / ${String(Math.min(Math.abs(v) / top, 1) * 0.55)})`,
                }}
              >
                {v === null ? '—' : v.toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

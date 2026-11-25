import styles from './WatchlistHeatmap.module.css';

export interface HeatTile {
  symbol: string;
  display: string;
  /** The day's change in percent; null while unknown. */
  changePct: number | null;
}

/** A move this large (3 %) gets the strongest colour. */
const FULL_MOVE = 3;

/** A tile's colour: the up or down colour mixed into the surface by the size of the move. */
function tileColor(changePct: number | null): string {
  if (changePct === null || changePct === 0) return 'var(--color-surface-raised)';
  const share = Math.round(15 + 55 * Math.min(Math.abs(changePct) / FULL_MOVE, 1));
  const hue = changePct > 0 ? 'var(--color-up)' : 'var(--color-down)';
  return `color-mix(in srgb, ${hue} ${String(share)}%, var(--color-surface))`;
}

/** The watchlist's symbols as tiles coloured by the day's change; a click charts the symbol. */
export function WatchlistHeatmap({
  tiles,
  active,
  onPick,
}: {
  tiles: readonly HeatTile[];
  active: string;
  onPick: (symbol: string) => void;
}) {
  if (tiles.length === 0) return null;
  return (
    <section className={styles.heatmap} aria-label="Day's change heatmap">
      <h3 className={styles.title}>Day&apos;s change</h3>
      <div className={styles.grid}>
        {tiles.map((t) => (
          <button
            key={t.symbol}
            type="button"
            className={styles.tile}
            style={{ background: tileColor(t.changePct) }}
            aria-current={t.symbol === active ? 'true' : undefined}
            title={`Chart ${t.display}`}
            onClick={() => {
              onPick(t.symbol);
            }}
          >
            <span className={styles.symbol}>{t.display}</span>
            <span className={styles.change}>
              {t.changePct === null
                ? '—'
                : `${t.changePct > 0 ? '+' : ''}${t.changePct.toFixed(2)}%`}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

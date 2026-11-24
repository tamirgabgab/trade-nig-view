import { useChartDataStore } from '../store/chartDataStore.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useReplayStore } from '../store/replayStore.ts';
import { useStructureStore } from '../store/structureStore.ts';
import { ForecastHorizons } from './ForecastHorizons.tsx';
import styles from './ForecastPanel.module.css';
import { ForecastValidation } from './ForecastValidation.tsx';
import { formatBarTime } from './formatClock.ts';
import { useChartForecast } from './useChartForecast.ts';
import { useDisplayTimeZone } from './useDisplayTimeZone.ts';

const KS = Array.from({ length: 20 }, (_, i) => i + 1);
const RIDGES = [1, 10, 100, 1000];
const LAGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The Forecast tab: the settings of the chart's forecast (k, the model, auto-tuned or manual), the
 * forecast per bar ahead, the walk-forward validation of models A and C against the naive one,
 * and the model's parameters and largest coefficients. While replaying, the forecast stays at its
 * origin until "Forecast from here" moves it to the cursor.
 */
export function ForecastPanel() {
  const zone = useDisplayTimeZone();
  const on = useStructureStore((s) => s.forecast);
  const toggle = useStructureStore((s) => s.toggleForecast);
  const settings = useStructureStore((s) => s.forecastSettings);
  const set = useStructureStore((s) => s.setForecastSettings);
  const symbol = useChartStore((s) => s.symbol);
  const decimals = useChartDataStore((s) => s.data?.decimals ?? 2);
  const replaying = useReplayStore((s) => s.mode === 'on' && s.symbol === symbol);
  const from = useReplayStore((s) => s.forecastFrom);
  const cursor = useReplayStore((s) => s.cursor);
  const fromHere = useReplayStore((s) => s.forecastFromHere);
  const forecast = useChartForecast(true);
  const f = forecast.data;

  return (
    <div className={styles.panel}>
      <div className={styles.settings}>
        <label className={styles.check}>
          <input type="checkbox" checked={on} onChange={toggle} />
          Show on chart
        </label>
        <label className={styles.field}>
          Bars ahead
          <select
            className={styles.select}
            value={settings.k}
            onChange={(event) => {
              set({ k: Number(event.target.value) });
            }}
          >
            {KS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Model
          <select
            className={styles.select}
            value={settings.model}
            onChange={(event) => {
              set({ model: event.target.value === 'a' ? 'a' : 'c' });
            }}
          >
            <option value="c">C: Ridge + HAR</option>
            <option value="a">A: OLS</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.auto}
            onChange={(event) => {
              set({ auto: event.target.checked });
            }}
          />
          Auto-tune
        </label>
        {!settings.auto && (
          <>
            <label className={styles.field}>
              Window
              <input
                className={styles.input}
                type="number"
                min={0}
                step={50}
                value={settings.window}
                title="Training bars (0 = all the history, else at least 60)"
                onChange={(event) => {
                  set({ window: Number(event.target.value) });
                }}
              />
            </label>
            {settings.model === 'c' && (
              <label className={styles.field}>
                Ridge
                <select
                  className={styles.select}
                  value={settings.ridge}
                  onChange={(event) => {
                    set({ ridge: Number(event.target.value) });
                  }}
                >
                  {RIDGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.field}>
              Past bars
              <select
                className={styles.select}
                value={settings.lags}
                onChange={(event) => {
                  set({ lags: Number(event.target.value) });
                }}
              >
                {LAGS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {replaying && (
        <div className={styles.settings}>
          <span className={styles.summary}>
            Frozen at {from === null ? '—' : formatBarTime(from, zone)}
          </span>
          <button
            type="button"
            className={styles.button}
            disabled={cursor === null || cursor === from}
            onClick={fromHere}
          >
            Forecast from here
          </button>
        </div>
      )}
      {forecast.isError ? (
        <p className={styles.empty} role="alert">
          No forecast: {forecast.error.message}
        </p>
      ) : f === undefined ? (
        <p className={styles.empty} role="status">
          Computing the forecast (tuning takes a second or two)…
        </p>
      ) : (
        <>
          <section className={styles.section} aria-label="Forecast">
            <h3 className={styles.heading}>
              {f.symbol} from {formatBarTime(f.lastTime, zone)}
            </h3>
            <ForecastHorizons forecast={f} decimals={decimals} />
          </section>
          <section className={styles.section} aria-label="Validation">
            <h3 className={styles.heading}>Validation out of sample</h3>
            <ForecastValidation forecast={f} />
          </section>
          <section className={styles.section} aria-label="Model">
            <h3 className={styles.heading}>Model</h3>
            <p className={styles.summary}>
              {f.auto ? 'Tuned' : 'Manual'}: window {f.params.window ?? 'all'}
              {f.model === 'c' && `, ridge ${String(f.params.ridge)}`}, past bars {f.params.lags}
            </p>
            <table className={styles.table} aria-label="Largest coefficients">
              <thead>
                <tr>
                  <th scope="col">Feature (next return)</th>
                  <th scope="col">Coefficient</th>
                </tr>
              </thead>
              <tbody>
                {[...f.coefficients]
                  .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
                  .slice(0, 6)
                  .map((c) => (
                    <tr key={c.feature}>
                      <th scope="row">{c.feature}</th>
                      <td>{c.value.toPrecision(3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className={styles.note}>
              Probabilities from past bars only, checked out of sample above. A research tool, not
              investment advice.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

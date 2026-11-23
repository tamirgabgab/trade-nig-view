import { readChartTheme } from '../chart/theme.ts';
import { TIME_ZONES, useSettingsStore, type TimeZoneSetting } from '../store/settingsStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import panel from './IndicatorSettingsPanel.module.css';
import { ModalShell } from './ModalShell.tsx';
import styles from './SettingsDialog.module.css';
import { usePresence } from './usePresence.ts';

const zoneLabel = (zone: TimeZoneSetting) =>
  zone === 'exchange' ? 'Exchange (the symbol’s own)' : zone.replace('_', ' ');

/** Chart settings (the gear): time zone, candle colours, last-price line, volume. Live. */
export function SettingsDialog() {
  const open = useUiStore((s) => s.modal === 'settings');
  const closeModal = useUiStore((s) => s.closeModal);
  const settings = useSettingsStore();
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  const theme = readChartTheme();

  return (
    <ModalShell
      key={key}
      title="Chart settings"
      attrs={attrs}
      className={styles.dialog}
      onClose={() => {
        closeModal('settings');
      }}
    >
      <div className={styles.body}>
        <div className={panel.field}>
          <label htmlFor="settings-zone" className={panel.label}>
            Time zone
          </label>
          <select
            id="settings-zone"
            className={panel.control}
            value={settings.timeZone}
            onChange={(event) => {
              const zone = TIME_ZONES.find((z) => z === event.target.value);
              if (zone !== undefined) settings.set({ timeZone: zone });
            }}
          >
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.colors}>
          <span className={panel.label}>Candles</span>
          <label className={styles.color}>
            <input
              type="color"
              className={panel.color}
              value={(settings.upColor ?? theme.up).toLowerCase()}
              onChange={(event) => {
                settings.set({ upColor: event.target.value });
              }}
            />
            Up
          </label>
          <label className={styles.color}>
            <input
              type="color"
              className={panel.color}
              value={(settings.downColor ?? theme.down).toLowerCase()}
              onChange={(event) => {
                settings.set({ downColor: event.target.value });
              }}
            />
            Down
          </label>
          <button
            type="button"
            className={panel.secondary}
            disabled={settings.upColor === null && settings.downColor === null}
            onClick={() => {
              settings.set({ upColor: null, downColor: null });
            }}
          >
            Reset colors
          </button>
        </div>
        <label className={panel.check}>
          <input
            type="checkbox"
            checked={settings.lastPriceLine}
            onChange={(event) => {
              settings.set({ lastPriceLine: event.target.checked });
            }}
          />
          Last price line
        </label>
        <label className={panel.check}>
          <input
            type="checkbox"
            checked={settings.volume}
            onChange={(event) => {
              settings.set({ volume: event.target.checked });
            }}
          />
          Volume
        </label>
      </div>
    </ModalShell>
  );
}

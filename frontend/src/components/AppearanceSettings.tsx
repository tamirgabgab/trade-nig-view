import { useState } from 'react';

import { shrinkImage, useBackdropImageStore } from '../store/backdropImageStore.ts';
import {
  ACCENTS,
  BACKDROPS,
  BLUR_MAX,
  DIM_RANGE,
  TEXT_SCALES,
  useSettingsStore,
  type Backdrop,
} from '../store/settingsStore.ts';
import { THEME_NAMES, THEMES, useThemeStore } from '../store/themeStore.ts';
import panel from './IndicatorSettingsPanel.module.css';
import styles from './SettingsDialog.module.css';

const BACKDROP_NAMES: Record<Backdrop, string> = {
  solid: 'Solid',
  gradient: 'Gradient',
  topo: 'Topographic lines',
  ghost: 'Ghost history',
  image: 'My image',
};

/**
 * Settings → Appearance: the theme preset, the accent, the text size, what is drawn behind the
 * chart (with the user's image, dimmed and blurred), the watermark, the Market pulse and the
 * watchlist heatmap. Every change applies at once.
 */
export function AppearanceSettings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const settings = useSettingsStore();
  const image = useBackdropImageStore((s) => s.image);
  const setImage = useBackdropImageStore((s) => s.setImage);
  const [imageError, setImageError] = useState<string | null>(null);

  return (
    <>
      <fieldset className={styles.group}>
        <legend className={panel.label}>Theme</legend>
        <div className={styles.swatches}>
          {THEMES.map((t) => (
            <label key={t} className={styles.swatch}>
              <input
                type="radio"
                name="theme"
                checked={theme === t}
                onChange={() => {
                  setTheme(t);
                }}
              />
              <span className={styles.preview} data-theme={t} aria-hidden="true">
                Aa
              </span>
              {THEME_NAMES[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={panel.label}>Accent</legend>
        <div className={styles.swatches}>
          {ACCENTS.map((a) => (
            <label key={a} className={styles.swatch}>
              <input
                type="radio"
                name="accent"
                checked={settings.accent === a}
                onChange={() => {
                  settings.set({ accent: a });
                }}
              />
              <span className={styles.dot} data-accent={a} aria-hidden="true" />
              {a[0]?.toUpperCase()}
              {a.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={`${panel.field} ${styles.wide}`}>
        <label htmlFor="settings-text" className={panel.label}>
          Text size
        </label>
        <select
          id="settings-text"
          className={panel.control}
          value={settings.textScale}
          onChange={(event) => {
            const scale = TEXT_SCALES.find((t) => t === Number(event.target.value));
            if (scale !== undefined) settings.set({ textScale: scale });
          }}
        >
          {TEXT_SCALES.map((t) => (
            <option key={t} value={t}>
              {Math.round(t * 100)}%
            </option>
          ))}
        </select>
      </div>
      <div className={`${panel.field} ${styles.wide}`}>
        <label htmlFor="settings-backdrop" className={panel.label}>
          Chart background
        </label>
        <select
          id="settings-backdrop"
          className={panel.control}
          value={settings.backdrop}
          onChange={(event) => {
            const backdrop = BACKDROPS.find((b) => b === event.target.value);
            if (backdrop !== undefined) settings.set({ backdrop });
          }}
        >
          {BACKDROPS.map((b) => (
            <option key={b} value={b}>
              {BACKDROP_NAMES[b]}
            </option>
          ))}
        </select>
      </div>
      {settings.backdrop === 'image' && (
        <div className={styles.image}>
          <div className={styles.imageRow}>
            <label className={panel.secondary}>
              {image === null ? 'Choose an image…' : 'Replace the image…'}
              <input
                type="file"
                accept="image/*"
                className="visually-hidden"
                aria-label="Choose a background image"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file === undefined) return;
                  shrinkImage(file).then(
                    (url) => {
                      try {
                        setImage(url); // saved to localStorage at once: a full store throws
                        setImageError(null);
                      } catch {
                        setImage(image);
                        setImageError('That image is too large to keep in this browser.');
                      }
                    },
                    () => {
                      setImageError('Could not read that file as an image.');
                    },
                  );
                }}
              />
            </label>
            {image !== null && (
              <button
                type="button"
                className={panel.secondary}
                onClick={() => {
                  setImage(null);
                }}
              >
                Remove image
              </button>
            )}
          </div>
          {imageError !== null && (
            <p className={panel.error} role="alert">
              {imageError}
            </p>
          )}
          <p className={styles.hint}>The image stays in this browser; nothing is uploaded.</p>
          <label className={styles.range}>
            Dim
            <input
              type="range"
              min={DIM_RANGE[0]}
              max={DIM_RANGE[1]}
              step={0.05}
              value={settings.imageDim}
              onChange={(event) => {
                settings.set({ imageDim: Number(event.target.value) });
              }}
            />
            <span>{Math.round(settings.imageDim * 100)}%</span>
          </label>
          <label className={styles.range}>
            Blur
            <input
              type="range"
              min={0}
              max={BLUR_MAX}
              step={1}
              value={settings.imageBlur}
              onChange={(event) => {
                settings.set({ imageBlur: Number(event.target.value) });
              }}
            />
            <span>{settings.imageBlur} px</span>
          </label>
        </div>
      )}
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={settings.watermark}
          onChange={(event) => {
            settings.set({ watermark: event.target.checked });
          }}
        />
        Symbol watermark
      </label>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={settings.pulse}
          onChange={(event) => {
            settings.set({ pulse: event.target.checked });
          }}
        />
        Market pulse (tint by the latest change)
      </label>
      <label className={panel.check}>
        <input
          type="checkbox"
          checked={settings.heatmap}
          onChange={(event) => {
            settings.set({ heatmap: event.target.checked });
          }}
        />
        Watchlist heatmap
      </label>
    </>
  );
}

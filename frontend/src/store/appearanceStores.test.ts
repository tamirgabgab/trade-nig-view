import { sanitizePersisted as sanitizeSettings } from './settingsStore.ts';
import { sanitizePersisted as sanitizeTheme, useThemeStore } from './themeStore.ts';

describe('appearance settings from storage', () => {
  it('keeps known values and defaults the rest', () => {
    const s = sanitizeSettings({
      accent: 'teal',
      textScale: 1.25,
      backdrop: 'topo',
      watermark: false,
      imageDim: 0.9,
      imageBlur: 4,
    });
    expect(s).toMatchObject({
      accent: 'teal',
      textScale: 1.25,
      backdrop: 'topo',
      watermark: false,
      pulse: true,
      heatmap: true,
      quietVolume: true,
      imageDim: 0.9,
      imageBlur: 4,
    });
    expect(
      sanitizeSettings({
        accent: 'pink',
        textScale: 3,
        backdrop: 'video',
        imageDim: 0.2,
        imageBlur: 99,
      }),
    ).toMatchObject({
      accent: 'blue',
      textScale: 1,
      backdrop: 'solid',
      imageDim: 0.85,
      imageBlur: 0,
    });
  });

  it('keeps a known theme preset, and the sun/moon toggles between the light and dark families', () => {
    expect(sanitizeTheme({ theme: 'midnight' })).toEqual({ theme: 'midnight' });
    expect(sanitizeTheme({ theme: 'neon' })).toEqual({ theme: 'dark' });
    useThemeStore.setState({ theme: 'paper' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    useThemeStore.setState({ theme: 'amber' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });
});

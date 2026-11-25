/** A /api/regime response for the tests. */
export const REGIME_BODY = {
  symbol: 'AAPL',
  interval: '1D',
  last_time: '2026-11-20',
  window: 252,
  ratios: [
    { q: 2, vr: 1.2, z: 2.9 },
    { q: 4, vr: 1.3, z: null },
  ],
  cd: 2.9,
  p_bootstrap: 0.01,
  p_asymptotic: 0.015,
  hurst_window: 0.62,
  hurst_null: [0.39, 0.63],
  hurst_history: 0.55,
  spectrum_window: { qs: [-2, 4], h: [0.6, 0.5], width: 0.1 },
  spectrum_history: { qs: [-2, 4], h: [0.55, null], width: null },
  label: 'trend',
  tint: 'trend',
  high_volatility: true,
  cells: [
    { regime: 'trend', high_volatility: true, share: 0.2 },
    { regime: 'random', high_volatility: false, share: 0.8 },
  ],
  forward: 10,
  rules: [
    {
      rule: 'RSI below 30',
      family: 'reversion',
      regime: 'trend',
      n: 12,
      mean: -0.01,
      edge: -0.012,
      t: -1.5,
      hit_rate: 0.4,
    },
  ],
};

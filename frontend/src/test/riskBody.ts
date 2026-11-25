/** A /api/risk response for the tests. */
export const RISK_BODY = {
  symbol: 'AAPL',
  interval: '1D',
  last_time: '2026-11-20',
  last_close: 100,
  sigma: 0.02,
  estimates: [
    { horizon: 'bar', bars: 1, method: 'fhs', level: 0.99, tail: 'long', var: 0.05, es: 0.06 },
    { horizon: 'week', bars: 5, method: 'normal', level: 0.99, tail: 'long', var: 0.1, es: 0.12 },
    { horizon: 'bar', bars: 1, method: 'evt', level: 0.9, tail: 'short', var: 0.02, es: 0.03 },
  ],
  tails: [{ tail: 'long', threshold: 1.3, xi: 0.2, beta: 0.5, exceedances: 300 }],
  backtests: [
    {
      method: 'fhs',
      level: 0.99,
      tail: 'long',
      n: 1000,
      breaches: 30,
      expected: 10,
      kupiec: 0.0001,
      christoffersen: null,
      z2: -0.8,
      z2_p: 0.01,
    },
  ],
};

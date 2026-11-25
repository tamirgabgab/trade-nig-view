import { parseTradePlan } from './tradePlan.ts';

const BODY = {
  symbol: 'AAPL',
  interval: '1D',
  side: 'short',
  h: 10,
  origin_time: '2026-01-02',
  origin_close: 100,
  sigma: 0.015,
  summary: {
    paths: 500,
    p_fill: 0.6,
    p_target: 0.3,
    p_stop: 0.6,
    p_neither: 0.1,
    p_target_bounds: [0.28, 0.31],
    bars: 6.5,
    ev_r: -0.05,
    ev_return: -0.001,
    loss_r: -1.04,
    kelly: null,
  },
  multiples: [0.5, 1],
  heat: [
    [0.1, null],
    [-0.2, 0.3],
  ],
  reference: 0.33,
  calibration: {
    n: 36,
    forecast: [0.05, null],
    observed: [0.04, null],
    count: [30, 0],
    brier: 0.1,
    brier_base: 0.2,
  },
  actual: 'stop',
  actual_r: -1.0,
};

describe('parseTradePlan', () => {
  it('reads the plan, keeping nulls', () => {
    const plan = parseTradePlan(BODY);
    expect(plan.side).toBe('short');
    expect(plan.summary?.pTargetBounds).toEqual([0.28, 0.31]);
    expect(plan.summary?.kelly).toBeNull();
    expect(plan.heat[0]).toEqual([0.1, null]);
    expect(plan.calibration?.brierBase).toBe(0.2);
    expect(plan.calibration?.forecast).toEqual([0.05, null]);
    expect(plan.actual).toBe('stop');
  });

  it('accepts no summary or calibration and refuses a non-object', () => {
    const plan = parseTradePlan({ ...BODY, summary: null, calibration: null, actual: 'x' });
    expect(plan.summary).toBeNull();
    expect(plan.calibration).toBeNull();
    expect(plan.actual).toBeNull();
    expect(() => parseTradePlan(null)).toThrow('Unexpected trade plan response');
  });
});

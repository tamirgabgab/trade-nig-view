import { parseFilterResponse } from './learn.ts';

const LINEAR = {
  name: 'ma',
  label: 'MA',
  linear: true,
  reason: null,
  step: [0.5, 1],
  ramp_lag: 0.5,
  impulse: [0.5, 0.5],
  dc_gain: 1,
  lag: 0.5,
  nrf: 0.5,
  frequency: { period: [2, 200], magnitude_db: [-120, -0.0004], group_delay: [null, 0.5] },
  truncated: false,
};

const ADAPTIVE = {
  name: 'ma',
  label: 'MA',
  linear: false,
  reason: 'adaptive',
  step: [0.2, 0.6, 1],
  ramp_lag: 1.25,
  impulse: null,
  dc_gain: null,
  lag: null,
  nrf: null,
  frequency: null,
  truncated: false,
};

describe('parseFilterResponse', () => {
  it('maps a linear output to camelCase and keeps undefined group delays as null', () => {
    const [out] = parseFilterResponse({ id: 'sma', outputs: [LINEAR] }).outputs;
    expect(out).toEqual({
      name: 'ma',
      label: 'MA',
      reason: null,
      step: [0.5, 1],
      rampLag: 0.5,
      impulse: [0.5, 0.5],
      dcGain: 1,
      lag: 0.5,
      nrf: 0.5,
      frequency: { period: [2, 200], magnitudeDb: [-120, -0.0004], groupDelay: [null, 0.5] },
      truncated: false,
    });
  });

  it('keeps the linear-only fields null for an adaptive average', () => {
    const [out] = parseFilterResponse({ id: 'kama', outputs: [ADAPTIVE] }).outputs;
    expect(out?.reason).toBe('adaptive');
    expect(out?.impulse).toBeNull();
    expect(out?.frequency).toBeNull();
    expect(out?.rampLag).toBe(1.25);
  });

  it('rejects a malformed body', () => {
    expect(() => parseFilterResponse({ id: 'sma' })).toThrow();
    expect(() => parseFilterResponse({ id: 'sma', outputs: [{ ...LINEAR, step: ['x'] }] })).toThrow(
      /step/,
    );
  });
});

import type { ParamInfo } from '../api/indicators.ts';
import { parseParamInput } from './paramInput.ts';

const LENGTH: ParamInfo = {
  name: 'length',
  type: 'int',
  default: 9,
  label: 'Length',
  min: 1,
  max: 5000,
  step: 1,
  options: [],
};

describe('parseParamInput', () => {
  it('accepts whole numbers in range', () => {
    expect(parseParamInput(LENGTH, ' 20 ')).toEqual({ ok: true, value: 20 });
    expect(parseParamInput(LENGTH, '5000')).toEqual({ ok: true, value: 5000 });
  });

  it.each(['', '0', '5001', '2.5', 'abc'])('says what fits for %j', (text) => {
    expect(parseParamInput(LENGTH, text)).toEqual({
      ok: false,
      error: 'Length needs a whole number from 1 to 5,000.',
    });
  });

  it('describes one-sided and open ranges for decimals', () => {
    const mult: ParamInfo = { ...LENGTH, type: 'float', label: 'Multiplier', max: null };
    expect(parseParamInput(mult, '2.5')).toEqual({ ok: true, value: 2.5 });
    expect(parseParamInput(mult, '0.5')).toEqual({
      ok: false,
      error: 'Multiplier needs a number of at least 1.',
    });
    expect(parseParamInput({ ...mult, min: null }, 'x')).toEqual({
      ok: false,
      error: 'Multiplier needs a number.',
    });
  });
});

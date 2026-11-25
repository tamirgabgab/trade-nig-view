import { REGIME_BODY } from '../test/regimeBody.ts';
import { parseRegime } from './regime.ts';

describe('parseRegime', () => {
  it('reads the test, the spectra, the map and the rules', () => {
    const r = parseRegime(REGIME_BODY);
    expect(r.label).toBe('trend');
    expect(r.ratios[1]?.z).toBeNull();
    expect(r.hurstNull).toEqual([0.39, 0.63]);
    expect(r.spectrumHistory?.h).toEqual([0.55, null]);
    expect(r.highVolatility).toBe(true);
    expect(r.rules[0]).toMatchObject({ family: 'reversion', regime: 'trend', hitRate: 0.4 });
    expect(parseRegime({ ...REGIME_BODY, label: 'x', high_volatility: null }).label).toBe('random');
    expect(() => parseRegime(null)).toThrow('Unexpected regime response');
  });
});

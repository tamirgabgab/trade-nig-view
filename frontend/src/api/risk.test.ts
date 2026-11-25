import { RISK_BODY } from '../test/riskBody.ts';
import { parseRisk } from './risk.ts';

describe('parseRisk', () => {
  it('reads the estimates, tails and backtests', () => {
    const r = parseRisk(RISK_BODY);
    expect(r.estimates).toHaveLength(3);
    expect(r.estimates[2]).toMatchObject({ method: 'evt', tail: 'short', level: 0.9 });
    expect(r.backtests[0]?.christoffersen).toBeNull();
    expect(r.backtests[0]?.z2P).toBe(0.01);
    expect(() => parseRisk(null)).toThrow('Unexpected risk response');
    const unknown = { ...RISK_BODY, estimates: [{ ...RISK_BODY.estimates[0], method: 'garch' }] };
    expect(parseRisk(unknown).estimates).toEqual([]);
  });
});

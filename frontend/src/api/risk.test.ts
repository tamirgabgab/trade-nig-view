import { RISK_BODY } from '../test/riskBody.ts';
import { parseRisk } from './risk.ts';

describe('parseRisk', () => {
  it('reads the estimates, tails, backtests and breaches', () => {
    const r = parseRisk(RISK_BODY);
    expect(r.estimates).toHaveLength(3);
    expect(r.estimates[2]).toMatchObject({ method: 'evt', tail: 'short', level: 0.9 });
    expect(r.backtests[0]?.christoffersen).toBeNull();
    expect(r.backtests[0]?.z2P).toBe(0.01);
    expect(r.breaches[0]?.times).toEqual(['2026-03-02', 1_700_000_000]);
    expect(() => parseRisk(null)).toThrow('Unexpected risk response');
  });
});

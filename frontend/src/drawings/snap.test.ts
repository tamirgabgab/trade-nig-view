import { magnetPrice, WEAK_MAGNET_PX } from './snap.ts';

const bar = { open: 10, high: 12, low: 9, close: 11 };
// 10 px per price unit, price 0 at y = 200.
const toY = (price: number) => 200 - price * 10;

describe('magnetPrice', () => {
  it('weak: snaps to the nearest O/H/L/C only within reach', () => {
    expect(magnetPrice(11.8, toY(11.8), bar, 'weak', toY)).toBe(12);
    const far = 12 + (WEAK_MAGNET_PX + 5) / 10;
    expect(magnetPrice(far, toY(far), bar, 'weak', toY)).toBe(far);
  });

  it('strong: always snaps; off: never', () => {
    expect(magnetPrice(20, toY(20), bar, 'strong', toY)).toBe(12);
    expect(magnetPrice(11.8, toY(11.8), bar, 'off', toY)).toBe(11.8);
    expect(magnetPrice(11.8, toY(11.8), undefined, 'strong', toY)).toBe(11.8);
  });
});

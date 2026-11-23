import { logicalToTime, timeToLogical } from './anchors.ts';

const DAY = 86_400;
// Mon..Fri, then the next Monday (a weekend gap).
const days = [0, 1, 2, 3, 4, 7].map((d) => 1_700_000_000 + d * DAY);

describe('anchor mapping', () => {
  it('maps a bar open to its index and an instant inside a bar to a fraction', () => {
    expect(timeToLogical(days, days[2] ?? 0)).toBe(2);
    expect(timeToLogical(days, (days[1] ?? 0) + DAY / 4)).toBe(1.25);
  });

  it('puts a weekend instant inside the Friday bar (the gap belongs to the bar before it)', () => {
    const saturday = (days[4] ?? 0) + DAY;
    expect(timeToLogical(days, saturday)).toBeCloseTo(4 + 1 / 3);
  });

  it('extrapolates past both ends with the neighbouring spacing', () => {
    expect(timeToLogical(days, (days[5] ?? 0) + 2 * 3 * DAY)).toBe(7);
    expect(timeToLogical(days, (days[0] ?? 0) - 2 * DAY)).toBe(-2);
  });

  it('inverts: logical index back to the same instant', () => {
    for (const t of [days[0] ?? 0, (days[3] ?? 0) + 3600, (days[5] ?? 0) + 5 * DAY]) {
      expect(logicalToTime(days, timeToLogical(days, t))).toBe(t);
    }
  });

  it('lands on the same instant on another interval (daily anchor on weekly bars)', () => {
    const weeks = [days[0] ?? 0, days[5] ?? 0]; // weekly bars open on the Mondays
    const wednesday = days[2] ?? 0;
    expect(timeToLogical(weeks, wednesday)).toBeCloseTo(2 / 7);
    expect(logicalToTime(weeks, timeToLogical(weeks, wednesday))).toBe(wednesday);
  });

  it('has no position without bars', () => {
    expect(timeToLogical([], 1)).toBeNaN();
    expect(logicalToTime([], 1)).toBeNaN();
  });
});

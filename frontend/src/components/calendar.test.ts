import { addDays, addMonths, formatDay, monthCells, snapDay } from './calendar.ts';

describe('calendar', () => {
  it('formats a day as DD/MM/YYYY', () => {
    expect(formatDay('2024-01-02')).toBe('02/01/2024');
  });

  it('adds days and months across year ends and leap days', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-01-03', -7)).toBe('2023-12-27');
    expect(addMonths('2024-12-31', 1)).toBe('2025-01-01');
    expect(addMonths('2024-01-15', -1)).toBe('2023-12-01');
  });

  it('lays out a month Sunday first', () => {
    const cells = monthCells(2024, 2); // 1 Feb 2024 is a Thursday; a leap February
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, '2024-02-01']);
    expect(cells.at(-1)).toBe('2024-02-29');
    expect(cells).toHaveLength(4 + 29);
  });

  it('snaps to the nearest available day in a direction, else the other way', () => {
    const days = ['2024-01-02', '2024-01-05', '2024-02-01'];
    expect(snapDay(days, '2024-01-03', 1)).toBe('2024-01-05');
    expect(snapDay(days, '2024-01-03', -1)).toBe('2024-01-02');
    expect(snapDay(days, '2024-01-05', 1)).toBe('2024-01-05');
    expect(snapDay(days, '2024-03-01', 1)).toBe('2024-02-01');
    expect(snapDay(days, '2023-12-01', -1)).toBe('2024-01-02');
    expect(snapDay([], '2024-01-01', 1)).toBeUndefined();
  });
});

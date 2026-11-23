import type { IndicatorLine } from '../chart/ChartEngine.ts';
import { presentLines } from './presentLines.ts';

function line(group: string, color = '#ff9800', lineWidth = 2): IndicatorLine {
  return {
    key: `${group}:ma`,
    group,
    output: 'ma',
    ownPane: false,
    plot: 'line',
    values: [1, 2],
    color,
    lineWidth,
    visible: true,
    style: {},
    levels: [],
    levelFill: null,
  };
}

describe('presentLines', () => {
  const lines = [line('ema-1'), line('sma-2', '#2962ff')];

  it('returns the same lines when nothing is focused or new', () => {
    expect(presentLines(lines, null, null)).toBe(lines);
  });

  it('dims every other indicator while one is focused, keeping its values', () => {
    const shown = presentLines(lines, 'ema-1', null);
    expect(shown[0]).toBe(lines[0]);
    expect(shown[1]?.color).toBe('rgba(41, 98, 255, 0.2)');
    expect(shown[1]?.values).toBe(lines[1]?.values);
    expect(shown[1]?.style).toBe(lines[1]?.style); // a plain line: no data re-send
  });

  it('dims the histogram, marker and fill colours of the others too', () => {
    const macd = {
      ...line('macd-3'),
      plot: 'histogram' as const,
      style: { up: '#089981', format: 'x' },
    };
    const [, shown] = presentLines([lines[0] ?? line('ema-1'), macd], 'ema-1', null);
    expect(shown?.style).toEqual({ up: 'rgba(8, 153, 129, 0.2)', format: 'x' });
  });

  it('draws the newly added indicator thicker', () => {
    expect(presentLines(lines, null, 'sma-2').map((l) => l.lineWidth)).toEqual([2, 4]);
  });
});

import type { IndicatorInfo } from '../../api/indicators.ts';
import {
  buildRules,
  chartLines,
  logToPercent,
  missingIndicator,
  sliderRange,
  withDefaults,
} from './labModel.ts';

const output = (name: string, color: string, requires: string | null = null) => ({
  name,
  label: name.toUpperCase(),
  plot: 'line' as const,
  color,
  lineWidth: 2,
  style: {},
  requires,
});

const RSI: IndicatorInfo = {
  id: 'rsi',
  version: 1,
  name: 'Relative Strength Index',
  shortName: 'RSI',
  category: 'oscillators',
  overlay: false,
  params: [
    {
      name: 'length',
      type: 'int',
      default: 14,
      label: 'Length',
      min: 1,
      max: 500,
      step: 1,
      options: [],
      optionLabels: [],
      requires: null,
    },
    {
      name: 'ma_type',
      type: 'enum',
      default: 'none',
      label: 'MA',
      min: null,
      max: null,
      step: null,
      options: ['none', 'sma'],
      optionLabels: ['None', 'SMA'],
      requires: null,
    },
  ],
  outputs: [output('rsi', '#7E57C2'), output('rsi_ma', '#FDD835', 'ma_type')],
  levels: [30, 70],
  levelFill: [30, 70],
  learnSlug: 'rsi',
  description: '',
};

describe('lab model', () => {
  it('sends each distinct indicator once and points the rules at it', () => {
    const rsi = { id: 'rsi', params: { length: 14 } };
    const { indicators, conditions } = buildRules([
      { label: 'a', left: { indicator: rsi, output: 'rsi' }, op: 'lt', right: { value: 30 } },
      {
        label: 'b',
        left: { price: 'close' },
        op: 'gt',
        right: { indicator: { id: 'sma', params: { length: 200 } }, output: 'ma' },
      },
      {
        label: 'c',
        left: { indicator: { ...rsi }, output: 'rsi' },
        op: 'crosses_above',
        right: { value: 50 },
      },
    ]);
    expect(indicators.map((i) => i.id)).toEqual(['rsi', 'sma']);
    expect(conditions).toEqual([
      { left: { indicator: 0, output: 'rsi' }, op: 'lt', right: { value: 30 } },
      { left: { price: 'close' }, op: 'gt', right: { indicator: 1, output: 'ma' } },
      { left: { indicator: 0, output: 'rsi' }, op: 'crosses_above', right: { value: 50 } },
    ]);
  });

  it('puts an oscillator in a 0–100 pane with its levels and leaves out switched-off lines', () => {
    const result = {
      id: 'rsi',
      params: { length: 14, ma_type: 'none' },
      outputs: { rsi: [null, 55], rsi_ma: [null, null] },
      displayShift: 0,
    };
    const { overlays, pane } = chartLines(RSI, result);
    expect(overlays).toEqual([]);
    expect(pane).toMatchObject({ levels: [30, 70], domain: [0, 100] });
    expect(pane?.lines.map((l) => l.key)).toEqual(['rsi:rsi']);
  });

  it('fills a block’s params over the defaults and turns log returns into percent', () => {
    expect(withDefaults(RSI, { length: 7 })).toEqual({ length: 7, ma_type: 'none' });
    expect(logToPercent(Math.log(1.1))).toBeCloseTo(10, 12);
  });

  it('treats params equal after the defaults as one indicator, in any key order', () => {
    const rule = (params: Record<string, string | number>) => ({
      label: JSON.stringify(params),
      left: { indicator: { id: 'rsi', params }, output: 'rsi' },
      op: 'lt' as const,
      right: { value: 30 },
    });
    const { indicators } = buildRules(
      [rule({}), rule({ length: 14 }), rule({ ma_type: 'none', length: 14 }), rule({ length: 7 })],
      [RSI],
    );
    expect(indicators).toEqual([
      { id: 'rsi', params: { length: 14, ma_type: 'none' } },
      { id: 'rsi', params: { length: 7, ma_type: 'none' } },
    ]);
  });

  it('puts a slider on the step grid and never below the current value', () => {
    const length = RSI.params[0];
    if (length === undefined) throw new Error('RSI fixture has no length');
    const mult = {
      ...length,
      name: 'bb_mult',
      type: 'float' as const,
      min: 0.001,
      max: 50,
      step: 0.1,
    };
    expect(sliderRange(mult, 2)).toEqual({ min: 0.1, max: 50, step: 0.1 });
    expect(sliderRange(length, 500)).toMatchObject({ min: 1, max: 500 });
    expect(sliderRange(length, 14, { min: 2, max: 50 })).toEqual({
      min: 2,
      max: 50,
      step: 1,
    });
  });

  it('says why a lab cannot run once the registry is in', () => {
    expect(missingIndicator({ isError: false }, undefined, 'rsii')).toBeNull();
    expect(missingIndicator({ isError: false, data: [RSI] }, undefined, 'rsii')).toBe(
      "Unknown indicator 'rsii'.",
    );
    expect(missingIndicator({ isError: false, data: [RSI] }, RSI, 'rsi')).toBeNull();
    expect(missingIndicator({ isError: true }, undefined, 'rsi')).toMatch(/Could not load/);
  });
});

import type { IndicatorInfo } from '../../api/indicators.ts';
import { buildRules, chartLines, logToPercent, withDefaults } from './labModel.ts';

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
});

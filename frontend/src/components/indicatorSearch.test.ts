import { parseIndicatorList } from '../api/indicators.ts';
import { INDICATORS } from '../test/render.tsx';
import { opensIndicators, searchIndicators } from './indicatorSearch.ts';

const SPECS = parseIndicatorList(INDICATORS);

function ids(query: string): string[] {
  return searchIndicators(SPECS, query).flatMap((g) => g.indicators.map((s) => s.id));
}

describe('searchIndicators', () => {
  it('lists everything by category, sorted by name, for an empty query', () => {
    const groups = searchIndicators(SPECS, '  ');
    expect(groups.map((g) => g.label)).toEqual(['Moving averages']);
    expect(ids('')).toEqual(['ema', 'sma', 'smma', 'wma']);
  });

  it('puts the exact short name first, then prefixes and words', () => {
    expect(ids('sma')).toEqual(['sma']);
    expect(ids('smoothed')).toEqual(['smma']);
    expect(ids('EXP')).toEqual(['ema']);
    expect(ids('moving')).toEqual(['ema', 'sma', 'smma', 'wma']);
    expect(ids('weighted')).toEqual(['wma']);
    expect(ids('zzz')).toEqual([]);
  });
});

describe('opensIndicators', () => {
  function key(init: KeyboardEventInit, target?: HTMLElement): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    if (target !== undefined) Object.defineProperty(event, 'target', { value: target });
    return event;
  }

  it('opens on a plain slash outside text fields', () => {
    expect(opensIndicators(key({ key: '/' }, document.body))).toBe(true);
    expect(opensIndicators(key({ key: '/', ctrlKey: true }))).toBe(false);
    expect(opensIndicators(key({ key: 'a' }))).toBe(false);
    expect(opensIndicators(key({ key: '/' }, document.createElement('input')))).toBe(false);
    expect(opensIndicators(key({ key: '/' }, document.createElement('select')))).toBe(false);
  });
});

import { anchorOf, parseGlossary } from './learnLinks.ts';

describe('learn links', () => {
  it('makes heading anchors the way the page lint does', () => {
    expect(anchorOf('Why it works')).toBe('why-it-works');
    expect(anchorOf('%b and bandwidth')).toBe('b-and-bandwidth');
    expect(anchorOf('  Lag & noise (NRF) ')).toBe('lag-noise-nrf');
  });

  it('reads each ### entry’s first paragraph as plain text', () => {
    const glossary = [
      '# Glossary',
      '',
      '## B',
      '',
      '### Bar',
      'One period of prices: **open**, high, low, close',
      'and volume. See [sessions](learn:bars-and-sessions).',
      '',
      'A second paragraph is not part of the tooltip.',
      '',
      '### Warm-up',
      '',
      'The first bars with no value (`NaN`), $n - 1$ for an SMA.',
    ].join('\n');
    const entries = parseGlossary(glossary);
    expect(entries.get('bar')).toBe(
      'One period of prices: open, high, low, close and volume. See sessions.',
    );
    expect(entries.get('warm-up')).toBe('The first bars with no value (NaN), n - 1 for an SMA.');
    expect(entries.has('b')).toBe(false);
  });
});

import { filterCommands, MAX_RESULTS, type Command } from './commands.ts';

const command = (label: string, extra: Partial<Command> = {}): Command => ({
  id: label,
  group: 'Chart',
  label,
  run: () => undefined,
  ...extra,
});

describe('filterCommands', () => {
  const commands = [
    command('Switch to light theme'),
    command('Turn on log scale', { hint: 'log' }),
    command('Apple Inc.', { group: 'Symbols', hint: 'AAPL' }),
    command('Add Exponential Moving Average', { hint: 'EMA', keywords: 'trend' }),
    command('Logarithmic scale'),
  ];

  it('matches every word in label, hint or keywords, any case', () => {
    expect(filterCommands(commands, 'aapl').map((c) => c.label)).toEqual(['Apple Inc.']);
    expect(filterCommands(commands, 'ema trend').map((c) => c.label)).toEqual([
      'Add Exponential Moving Average',
    ]);
    expect(filterCommands(commands, 'nothing like this')).toEqual([]);
  });

  it('ranks a label that starts with the query first, then a word start', () => {
    expect(filterCommands(commands, 'log').map((c) => c.label)).toEqual([
      'Logarithmic scale',
      'Turn on log scale',
    ]);
  });

  it('shows everything (capped) for an empty query', () => {
    const many = Array.from({ length: MAX_RESULTS + 5 }, (_, i) => command(`c${String(i)}`));
    expect(filterCommands(many, '  ')).toHaveLength(MAX_RESULTS);
  });
});

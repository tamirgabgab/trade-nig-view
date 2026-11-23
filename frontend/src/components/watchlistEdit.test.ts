import {
  addSection,
  addSymbol,
  moveSymbol,
  removeSection,
  removeSymbol,
  renameSection,
} from './watchlistEdit.ts';

const LIST = [
  { title: 'Indices', symbols: ['^GSPC'] },
  { title: 'Stocks', symbols: ['AAPL', 'TSLA', 'NVDA'] },
];

describe('watchlist edits', () => {
  it('moves a symbol within and across sections', () => {
    expect(moveSymbol(LIST, 'NVDA', 1, 'AAPL')[1]?.symbols).toEqual(['NVDA', 'AAPL', 'TSLA']);
    const across = moveSymbol(LIST, 'TSLA', 0, null);
    expect(across.map((s) => s.symbols)).toEqual([
      ['^GSPC', 'TSLA'],
      ['AAPL', 'NVDA'],
    ]);
    expect(moveSymbol(LIST, 'AAPL', 1, 'AAPL')).toEqual(LIST);
  });

  it('adds a symbol once, at the end of the last section', () => {
    expect(addSymbol(LIST, 'MSFT')[1]?.symbols).toEqual(['AAPL', 'TSLA', 'NVDA', 'MSFT']);
    expect(addSymbol(LIST, 'AAPL')).toEqual(LIST);
    expect(addSymbol([], 'MSFT')).toEqual([{ title: 'Symbols', symbols: ['MSFT'] }]);
  });

  it('removes symbols; adds, renames and removes sections (their symbols stay)', () => {
    expect(removeSymbol(LIST, 'TSLA')[1]?.symbols).toEqual(['AAPL', 'NVDA']);
    expect(addSection(LIST, 'Crypto').at(-1)).toEqual({ title: 'Crypto', symbols: [] });
    expect(renameSection(LIST, 0, 'Index')[0]?.title).toBe('Index');
    expect(removeSection(LIST, 1)).toEqual([
      { title: 'Indices', symbols: ['^GSPC', 'AAPL', 'TSLA', 'NVDA'] },
    ]);
    expect(removeSection(LIST, 0)[0]).toEqual({
      title: 'Stocks',
      symbols: ['AAPL', 'TSLA', 'NVDA', '^GSPC'],
    });
    expect(removeSection([LIST[0] ?? { title: '', symbols: [] }], 0)).toHaveLength(1);
  });
});

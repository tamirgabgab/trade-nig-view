import { backgroundRuns } from './backgroundLayer.ts';

describe('backgroundRuns', () => {
  it('joins equal neighbours and skips zeros and gaps', () => {
    expect(backgroundRuns([null, 1, 1, 0, -1, -1, 1, null, 1], 'b', 'o')).toEqual([
      { start: 1, end: 2, color: 'b' },
      { start: 4, end: 5, color: 'o' },
      { start: 6, end: 6, color: 'b' },
      { start: 8, end: 8, color: 'b' },
    ]);
    expect(backgroundRuns([], 'b', 'o')).toEqual([]);
  });
});

import { toCsv } from './csv.ts';

describe('toCsv', () => {
  it('writes raw numbers and ISO dates, a row a line, for Excel', () => {
    const csv = toCsv(
      ['date', 'amount', 'note'],
      [
        ['2020-01-15', 1234.5, 'first'],
        ['2020-02-15', -62.25, null],
      ],
    );
    // A byte-order mark so Excel reads UTF-8, and CRLF line ends.
    expect(csv).toBe('\uFEFFdate,amount,note\r\n2020-01-15,1234.5,first\r\n2020-02-15,-62.25,\r\n');
  });

  it('quotes what would break a cell', () => {
    const csv = toCsv(['name'], [['a,b'], ['say "hi"'], ['two\nlines'], [' plain ']]);
    expect(csv.split('\r\n').slice(1, 5)).toEqual([
      '"a,b"',
      '"say ""hi"""',
      '"two\nlines"',
      ' plain ',
    ]);
  });

  it('never lets a cell start a formula', () => {
    // A cell that starts with =, +, - or @ would run in a spreadsheet: text gets an apostrophe.
    expect(toCsv(['x'], [['=1+1'], ['@cmd'], [-5], ['-5 as text']])).toBe(
      "\uFEFFx\r\n'=1+1\r\n'@cmd\r\n-5\r\n'-5 as text\r\n",
    );
  });
});

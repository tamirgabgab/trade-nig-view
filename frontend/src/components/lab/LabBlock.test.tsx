import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { INDICATORS, renderWithQuery, stubApi, SYMBOLS } from '../../test/render.tsx';
import { LabBlock } from './LabBlock.tsx';

describe('LabBlock', () => {
  it.each([
    'not json',
    '{"kind": "nope"}',
    '{"kind": "combo", "rule": []}',
    '{"kind": "combo", "rules": [{"label": "x", "left": {"price": "close"}, "op": "gte", "right": {}}]}',
    '{"kind": "event", "indicator": "rsi", "output": "rsi", "op": "lt"}',
    '{"kind": "param", "vary": "length"}',
    '{"kind": "replay", "symbol": "SPY"}',
    '{"kind": "forecast", "model": "C"}',
    '{"kind": "forecast", "scenario": "sideways"}',
    '{"kind": "forecast", "k": 30}',
    '{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "steps": "one step"}',
    '{"kind": "param", "indicator": "sma", "vary": "length", "interval": "1H"}',
    '{"kind": "combo", "rules": [{"label": "x", "left": {"price": "close"}, "op": "gt", "right": {"price": "close", "ago": "20"}}]}',
    '{"kind": "combo", "rules": [{"label": "x", "left": {"price": "close"}, "op": "gt", "right": {"value": 30, "ago": 5}}]}',
    '{"kind": "combo", "rules": [{"label": "x", "left": {"price": "close"}, "op": "gt", "right": {"price": "close", "ago": 1000}}]}',
  ])('shows an error line instead of a widget for %s', (source) => {
    render(<LabBlock source={source} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
  });
});

describe('a guided replay exercise', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists its steps and hides what to look for until asked', async () => {
    const user = userEvent.setup();
    stubApi({ '/api/indicators': { body: INDICATORS }, '/api/symbols': { body: SYMBOLS } });
    renderWithQuery(
      <LabBlock
        source={JSON.stringify({
          kind: 'replay',
          symbol: 'AAPL',
          date: '2024-01-02',
          steps: ['Step one', 'Step two'],
          reveal: 'The answer',
        })}
      />,
    );
    const card = screen.getByRole('region', { name: 'Replay exercise' });
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Step one', 'Step two']);
    expect(within(card).getByText('The answer')).not.toBeVisible();
    await user.click(within(card).getByText('What to look for'));
    expect(within(card).getByText('The answer')).toBeVisible();
  });
});

import { render, screen } from '@testing-library/react';

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
  ])('shows an error line instead of a widget for %s', (source) => {
    render(<LabBlock source={source} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
  });
});

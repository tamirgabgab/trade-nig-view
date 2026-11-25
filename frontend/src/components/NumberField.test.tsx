import { fireEvent, render, screen } from '@testing-library/react';

import { NumberField } from './NumberField.tsx';

describe('NumberField', () => {
  it('keeps the typed text and commits a valid number on Enter or blur only', () => {
    const commit = vi.fn();
    render(
      <NumberField label="Risk %" value={1} min={0} max={100} step={0.25} onCommit={commit} />,
    );
    const input = screen.getByLabelText('Risk %');
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue(0); // not snapped back while typing
    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(commit).toHaveBeenCalledWith(0.5);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(commit).toHaveBeenCalledTimes(1); // 0 is out of (0, 100]
    expect(input).toHaveValue(1); // the stored value is back
  });
});

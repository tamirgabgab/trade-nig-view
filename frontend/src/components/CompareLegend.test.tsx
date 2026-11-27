import { render, screen } from '@testing-library/react';

import { CompareLegend } from './CompareLegend.tsx';

describe('CompareLegend', () => {
  it('says why a synthetic symbol has no line on a minute chart', () => {
    render(
      <CompareLegend
        compare={[
          {
            symbol: 'SYN:WALK',
            display: 'SYN:WALK',
            bars: [],
            decimals: 2,
            synthetic: true,
            note: 'no minute bars',
          },
        ]}
        time={undefined}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('SYN:WALKSYNno minute bars');
    expect(screen.getByRole('img', { name: 'Synthetic' })).toBeInTheDocument();
  });
});

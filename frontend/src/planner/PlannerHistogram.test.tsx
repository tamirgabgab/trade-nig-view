import { fireEvent, render, screen } from '@testing-library/react';

import { PlannerHistogram } from './PlannerHistogram.tsx';

// 1 .. 100 against 51 .. 150: the pooled quartiles are 50.75 and 100.25.
const X = Array.from({ length: 100 }, (_, i) => i + 1);
const Y = X.map((v) => v + 50);

function chart() {
  render(
    <PlannerHistogram
      x={X}
      y={Y}
      names={['Apartment', 'Market']}
      measure="end value"
      format={(v) => v.toFixed(0)}
      step={1}
    />,
  );
  return {
    a: screen.getByRole('slider', { name: 'Lower bound a' }),
    b: screen.getByRole('slider', { name: 'Upper bound b' }),
    chance: (name: string) =>
      screen.getByText(new RegExp(`^${name}:`), { selector: 'p' }).textContent,
  };
}

describe('PlannerHistogram', () => {
  it('starts the handles at the pooled quartiles and counts each option between them', () => {
    const { a, b, chance } = chart();
    expect(screen.getByRole('group', { name: /^Distribution of the end value/ })).toBeVisible();
    expect(a).toHaveAttribute('aria-valuenow', '50.75');
    expect(b).toHaveAttribute('aria-valuenow', '100.25');
    expect(a).toHaveAttribute('aria-valuetext', '51');
    // 51 .. 100 of each option lie between them: half of its worlds.
    expect(chance('Apartment')).toContain('50.00% of the worlds end between 51 and 100');
    expect(chance('Market')).toContain('50.00%');
    expect(chance('Market')).toMatch(/95% interval of the simulation: 40\.\d\d% to 59\.\d\d%/);
  });

  it('moves a handle with the keyboard, never past the other one', () => {
    const { a, b, chance } = chart();
    fireEvent.keyDown(a, { key: 'Home' });
    expect(Number(a.getAttribute('aria-valuenow'))).toBeLessThan(2);
    // On the end of the axis a handle takes the tail with it: 1 .. 100 are all in.
    expect(chance('Apartment')).toContain('100.00% of the worlds end at 100 or below');
    fireEvent.keyDown(a, { key: 'End' });
    expect(a).toHaveAttribute('aria-valuenow', '100.25'); // stopped at b
    const before = Number(b.getAttribute('aria-valuenow'));
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    const step = Number(b.getAttribute('aria-valuenow')) - before;
    expect(step).toBeGreaterThan(0);
    fireEvent.keyDown(b, { key: 'ArrowRight', shiftKey: true });
    expect(Number(b.getAttribute('aria-valuenow')) - before - step).toBeCloseTo(10 * step, 9);
    fireEvent.keyDown(b, { key: 'ArrowLeft' });
    fireEvent.keyDown(b, { key: 'a' }); // any other key is left alone
    expect(Number(b.getAttribute('aria-valuenow')) - before).toBeCloseTo(10 * step, 9);
  });

  it('keeps the focus on a handle that reaches the other one', () => {
    const { a, b } = chart();
    fireEvent.keyDown(b, { key: 'End' });
    a.focus();
    fireEvent.keyDown(a, { key: 'End' });
    expect(a).toHaveAttribute('aria-valuenow', b.getAttribute('aria-valuenow'));
    // The same element, still focused: the keys go on working from where it stands.
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(Number(a.getAttribute('aria-valuenow'))).toBeLessThan(
      Number(b.getAttribute('aria-valuenow')),
    );
  });

  it('sets a handle exactly from its field', () => {
    const { b, chance } = chart();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Upper bound b' }), {
      target: { value: '120' },
    });
    expect(b).toHaveAttribute('aria-valuenow', '120');
    // Market: 51 .. 120 of 51 .. 150.
    expect(chance('Market')).toContain('70.00% of the worlds end between 51 and 120');
  });

  it('draws a bar per bin for each option, with the tails in the end bars', () => {
    chart();
    const titles = [...document.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toHaveLength(80);
    expect(titles.filter((t) => t.startsWith('Apartment:'))).toHaveLength(40);
    const worlds = (name: string) =>
      titles
        .filter((t) => t.startsWith(name))
        .reduce((sum, t) => sum + Number(/: (\d+) worlds/.exec(t)?.[1]), 0);
    expect([worlds('Apartment'), worlds('Market')]).toEqual([100, 100]);
    // The end bars say that they hold the tails.
    expect(titles[0]).toMatch(/^Apartment: \d+ worlds at \d+ or below$/);
    expect(titles[39]).toMatch(/^Apartment: \d+ worlds at \d+ or above$/);
    expect(titles[1]).toMatch(/^Apartment: \d+ worlds from \d+ to \d+$/);
  });
});

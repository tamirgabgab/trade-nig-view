import { fireEvent, render, screen } from '@testing-library/react';

import { PANEL_WIDTHS, sanitizePersisted, usePanelWidthStore } from '../store/panelWidthStore.ts';
import { ResizeHandle } from './ResizeHandle.tsx';

beforeEach(() => {
  usePanelWidthStore.setState({ sidebar: 320, learn: 580 });
  window.innerWidth = 1600;
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

describe('ResizeHandle', () => {
  it('widens by a drag to the left, within the bounds and the room the chart keeps', () => {
    render(<ResizeHandle panel="sidebar" label="Resize the side panel" />);
    const handle = screen.getByRole('separator', { name: 'Resize the side panel' });
    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(usePanelWidthStore.getState().sidebar).toBe(420);
    fireEvent.pointerMove(handle, { clientX: 1500, pointerId: 1 });
    expect(usePanelWidthStore.getState().sidebar).toBe(PANEL_WIDTHS.sidebar.min);
    fireEvent.pointerMove(handle, { clientX: -2000, pointerId: 1 });
    expect(usePanelWidthStore.getState().sidebar).toBe(PANEL_WIDTHS.sidebar.max);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 1 });
    expect(usePanelWidthStore.getState().sidebar).toBe(PANEL_WIDTHS.sidebar.max); // no drag
  });

  it('ignores a right-button drag', () => {
    render(<ResizeHandle panel="sidebar" label="Resize the side panel" />);
    const handle = screen.getByRole('separator', { name: 'Resize the side panel' });
    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1, button: 2 });
    fireEvent.pointerMove(handle, { clientX: 800, pointerId: 1 });
    expect(usePanelWidthStore.getState().sidebar).toBe(320);
  });

  it('moves by the arrows and restores the default on a double click', () => {
    render(<ResizeHandle panel="learn" label="Resize the learn panel" />);
    const handle = screen.getByRole('separator', { name: 'Resize the learn panel' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '604');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(usePanelWidthStore.getState().learn).toBe(556);
    fireEvent.doubleClick(handle);
    expect(usePanelWidthStore.getState().learn).toBe(PANEL_WIDTHS.learn.initial);
  });

  it('keeps the chart 360 px on a narrow window', () => {
    window.innerWidth = 1000;
    render(<ResizeHandle panel="learn" label="Resize the learn panel" />);
    const handle = screen.getByRole('separator', { name: 'Resize the learn panel' });
    fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(usePanelWidthStore.getState().learn).toBe(640);
  });
});

describe('panel widths from storage', () => {
  it('keeps finite widths, clamped, and defaults the rest', () => {
    expect(sanitizePersisted({ sidebar: 5000, learn: 'wide' })).toEqual({
      sidebar: PANEL_WIDTHS.sidebar.max,
      learn: PANEL_WIDTHS.learn.initial,
    });
    expect(sanitizePersisted(null)).toEqual({ sidebar: 320, learn: 580 });
  });
});

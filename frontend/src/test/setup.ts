import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { useChartDataStore } from '../store/chartDataStore.ts';

afterEach(() => {
  cleanup();
  // Shared by the chart and the side panels: no crosshair or data leaks into the next test.
  useChartDataStore.setState(useChartDataStore.getInitialState());
});

// jsdom does not lay out, so it has no scrollIntoView (the command palette keeps its pick in view).
Element.prototype.scrollIntoView = () => undefined;

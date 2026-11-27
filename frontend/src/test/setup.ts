import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

import { useChartDataStore } from '../store/chartDataStore.ts';

// findBy and waitFor give up after a second by default. A query that retries after a second, or
// the first load of a lazy panel, then races that limit, and a slow CI runner (Windows) loses.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  // Shared by the chart and the side panels: no crosshair or data leaks into the next test.
  useChartDataStore.setState(useChartDataStore.getInitialState());
});

// jsdom does not lay out, so it has no scrollIntoView (the command palette keeps its pick in view).
Element.prototype.scrollIntoView = () => undefined;

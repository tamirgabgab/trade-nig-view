import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not lay out, so it has no scrollIntoView (the command palette keeps its pick in view).
Element.prototype.scrollIntoView = () => undefined;

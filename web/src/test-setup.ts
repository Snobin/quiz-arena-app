import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement scrolling; the shell restores scroll offsets with window.scrollTo.
window.scrollTo = (() => {}) as typeof window.scrollTo;

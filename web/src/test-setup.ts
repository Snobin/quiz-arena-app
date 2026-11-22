import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// Screens are React.lazy chunks: the first visit in a worker loads and transforms them on demand,
// which can pass Testing Library's 1 s default when ~70 files run in parallel (or with coverage on).
// findBy*/waitFor still return as soon as the element appears; this only raises the ceiling.
configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement scrolling; the shell restores scroll offsets with window.scrollTo.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// The app starts in the device language (i18n/language.ts › deviceLanguage). Tests run as a
// Malayalam phone unless they say otherwise; jsdom's default would be en-US. A plain property,
// not a mock, so vi.restoreAllMocks() in a test file never undoes it.
Object.defineProperty(window.navigator, 'languages', { value: ['ml-IN', 'en-IN'], configurable: true });
Object.defineProperty(window.navigator, 'language', { value: 'ml-IN', configurable: true });

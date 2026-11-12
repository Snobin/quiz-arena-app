import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement scrolling; the shell restores scroll offsets with window.scrollTo.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// The app starts in the device language (i18n/language.ts › deviceLanguage). Tests run as a
// Malayalam phone unless they say otherwise; jsdom's default would be en-US. A plain property,
// not a mock, so vi.restoreAllMocks() in a test file never undoes it.
Object.defineProperty(window.navigator, 'languages', { value: ['ml-IN', 'en-IN'], configurable: true });
Object.defineProperty(window.navigator, 'language', { value: 'ml-IN', configurable: true });

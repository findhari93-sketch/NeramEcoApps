import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock window.matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Suppress console errors during tests (optional, can be configured)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Filter out specific React/Next.js warnings if needed
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes('Warning:') || message.includes('ReactDOM.render'))
    ) {
      return;
    }
    originalError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clean up after each test
afterEach(() => {
  // Clear any mocks
  vi.clearAllMocks();
});

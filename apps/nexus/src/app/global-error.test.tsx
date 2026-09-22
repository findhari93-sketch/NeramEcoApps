import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';

/**
 * The last-resort boundary, for a crash in the root layout itself (PERF-0028).
 *
 * Its "Reload" called reset(), which re-rendered the same tree from the same
 * device storage and could crash straight back here, and it recorded nothing,
 * so root crashes left no trace.
 */

const clearPersistentCache = vi.fn();
const clearCachedAuth = vi.fn();
vi.mock('@/lib/swr-cache', () => ({ clearPersistentCache: () => clearPersistentCache() }));
vi.mock('@/lib/auth-cache', () => ({ clearCachedAuth: () => clearCachedAuth() }));

import GlobalError from './global-error';

const reload = vi.fn();
let consoleError: MockInstance<Parameters<typeof console.error>, void>;
const crash = () => Object.assign(new Error('provider exploded'), { digest: 'g-7' });

beforeEach(() => {
  vi.clearAllMocks();
  // It renders its own <html>, which React warns about inside a test container.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
});

afterEach(() => {
  cleanup();
  consoleError.mockRestore();
});

describe('global error boundary', () => {
  it('reloads the page for real instead of re-rendering the same state', () => {
    const reset = vi.fn();
    render(<GlobalError error={crash()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /^reload$/i }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it('can clear saved data before reloading', () => {
    render(<GlobalError error={crash()} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear.*saved data.*reload/i }));
    expect(clearPersistentCache).toHaveBeenCalled();
    expect(clearCachedAuth).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('logs the crash and its digest', () => {
    render(<GlobalError error={crash()} reset={vi.fn()} />);
    const logged = consoleError.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/provider exploded/);
    expect(logged).toMatch(/g-7/);
  });

  it('is announced, speaks to everyone and uses no emoji for its icon', () => {
    const { container } = render(<GlobalError error={crash()} reset={vi.fn()} />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(screen.queryByText(/let your teacher know/i)).toBeNull();
    expect(container.textContent).not.toMatch(/⚠/);
    expect(screen.queryByText(/provider exploded/)).toBeNull();
  });
});

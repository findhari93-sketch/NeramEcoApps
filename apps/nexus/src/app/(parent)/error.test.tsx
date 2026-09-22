import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * A crash on a parent page used to replace the whole app with a student-worded
 * screen (PERF-0028). Inside the parent shell, the parent keeps their menu.
 */

const clearPersistentCache = vi.fn();
const recordError = vi.fn();

vi.mock('@/lib/swr-cache', () => ({ clearPersistentCache: () => clearPersistentCache() }));
vi.mock('@/lib/auth-cache', () => ({ clearCachedAuth: vi.fn() }));
vi.mock('@/lib/error-buffer', () => ({ recordError: (e: unknown) => recordError(e) }));
vi.mock('@/lib/capture-screenshot', () => ({ captureScreenshot: async () => null }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ user: { id: 'p1' }, nexusRole: 'parent', getToken: async () => 'par_x' }),
}));
vi.mock('@/components/issues/ReportIssueDialog', () => ({ default: () => null }));

import ParentError from './error';

const reload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
});

afterEach(() => cleanup());

describe('parent error boundary', () => {
  it('says only this page stopped, and the menu still works', () => {
    const { container } = render(<ParentError error={new Error('boom')} reset={vi.fn()} />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(screen.getByText(/menu/i)).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
    expect(screen.queryByText(/teacher/i)).toBeNull();
  });

  it('has Try again and a clear-and-reload escape, and no report a parent cannot send', () => {
    const reset = vi.fn();
    render(<ParentError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /clear.*saved data.*reload/i }));
    expect(clearPersistentCache).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();

    expect(screen.queryByRole('button', { name: /report/i })).toBeNull();
  });
});

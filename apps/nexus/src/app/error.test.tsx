import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * The boundary for everything the (teacher) and (student) ones cannot catch
 * (PERF-0028): a crash in a shell layout itself (TopBar, the providers), in the
 * Answer Pad during class, or on a sign-in page. Without it those fell to
 * global-error, which replaces the whole document with student copy and a
 * "Reload" that re-rendered from the same cached data.
 */

const clearPersistentCache = vi.fn();
const clearCachedAuth = vi.fn();
const recordError = vi.fn();
let auth: { user: unknown; nexusRole: string | null; getToken: () => Promise<string> };

vi.mock('@/lib/swr-cache', () => ({ clearPersistentCache: () => clearPersistentCache() }));
vi.mock('@/lib/auth-cache', () => ({ clearCachedAuth: () => clearCachedAuth() }));
vi.mock('@/lib/error-buffer', () => ({ recordError: (e: unknown) => recordError(e) }));
vi.mock('@/lib/capture-screenshot', () => ({ captureScreenshot: async () => null }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('@/components/issues/ReportIssueDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>report dialog</div> : null),
}));

import RootError from './error';

const reload = vi.fn();
const crash = () =>
  Object.assign(new Error("Cannot read properties of undefined (reading 'byBucket')"), { digest: 'd-42' });

beforeEach(() => {
  vi.clearAllMocks();
  auth = { user: { id: 'u1' }, nexusRole: 'teacher', getToken: async () => 'token' };
  Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
});

afterEach(() => cleanup());

describe('root error boundary', () => {
  it('announces the failure and never shows the raw error', () => {
    const { container } = render(<RootError error={crash()} reset={vi.fn()} />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expect(screen.queryByText(/byBucket/)).toBeNull();
    expect(screen.queryByText(/d-42/)).toBeNull();
  });

  it('speaks to anyone: teacher, student or parent', () => {
    render(<RootError error={crash()} reset={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/something went wrong/i);
    expect(screen.queryByText(/let your teacher know/i)).toBeNull();
    expect(screen.queryByText(/teacher/i)).toBeNull();
  });

  it('records the crash with its digest, so a report carries it', () => {
    render(<RootError error={crash()} reset={vi.fn()} />);
    expect(recordError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('d-42') }));
  });

  it('tries again with reset()', () => {
    const reset = vi.fn();
    render(<RootError error={crash()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('can clear the saved data a crash may be coming from, then reload', () => {
    render(<RootError error={crash()} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear.*saved data.*reload/i }));
    expect(clearPersistentCache).toHaveBeenCalled();
    expect(clearCachedAuth).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('offers a report to a signed-in teacher or student', () => {
    render(<RootError error={crash()} reset={vi.fn()} />);
    expect(screen.getByRole('button', { name: /report this issue/i })).toBeTruthy();
  });

  it.each([
    ['a parent', { id: 'p1' }, 'parent'],
    ['someone signed out', null, null],
  ])('does not offer a report to %s, who cannot send one', (_who, user, nexusRole) => {
    auth = { ...auth, user, nexusRole };
    render(<RootError error={crash()} reset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /report this issue/i })).toBeNull();
  });

  it('keeps every button at a comfortable tap size', () => {
    render(<RootError error={crash()} reset={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(getComputedStyle(button).minHeight).toBe('48px');
    }
  });
});

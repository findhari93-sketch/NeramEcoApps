import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TeacherError from './error';

/**
 * The point of this boundary is what it does NOT do.
 *
 * Before it existed, a crash under (teacher) fell through to global-error.tsx,
 * which renders its own document: the teacher lost the sidebar, the nav and every
 * route out, and was told in student copy to "let your teacher know". These tests
 * hold the three things that fixed it, since none of them is visible from the
 * file's own code: it stays inside the layout, it says the right thing to the
 * right audience, and it can break a crash loop that `reset()` alone cannot.
 */

const clearPersistentCache = vi.fn();
const recordError = vi.fn();

vi.mock('@/lib/swr-cache', () => ({ clearPersistentCache: () => clearPersistentCache() }));
vi.mock('@/lib/error-buffer', () => ({ recordError: (e: unknown) => recordError(e) }));
vi.mock('@/lib/capture-screenshot', () => ({ captureScreenshot: async () => null }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'token' }),
}));
vi.mock('@/components/issues/ReportIssueDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>report dialog</div> : null),
}));

const reload = vi.fn();

function renderBoundary(reset = vi.fn()) {
  const error = Object.assign(new Error("Cannot read properties of undefined (reading 'run_over')"), {
    digest: 'abc123',
  });
  render(<TeacherError error={error} reset={reset} />);
  return { reset };
}

describe('teacher error boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
      configurable: true,
    });
  });

  it('never shows the teacher the raw error', () => {
    renderBoundary();

    expect(screen.queryByText(/run_over/)).toBeNull();
    expect(screen.queryByText(/abc123/)).toBeNull();
  });

  it('talks to a teacher, not to a student', () => {
    renderBoundary();

    // The global boundary this replaces says "let your teacher know".
    expect(screen.queryByText(/let your teacher know/i)).toBeNull();
    expect(screen.getByText(/rest of Nexus is fine/i)).toBeTruthy();
  });

  it('announces the failure rather than only colouring it', () => {
    const { container } = render(
      <TeacherError error={new Error('boom')} reset={vi.fn()} />,
    );

    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('records the crash so a report carries it', () => {
    renderBoundary();

    expect(recordError).toHaveBeenCalledTimes(1);
    expect(recordError.mock.calls[0][0].message).toContain('run_over');
    expect(recordError.mock.calls[0][0].message).toContain('abc123');
  });

  it('retries in place', () => {
    const { reset } = renderBoundary();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  /**
   * The recovery path `reset()` cannot give. When the crash came out of the
   * cached payload itself, re-rendering reads the same poison and lands back
   * here, which is exactly the loop a teacher hit on /teacher/catch-up.
   */
  it('can drop the device cache and reload, which is what breaks a crash loop', () => {
    renderBoundary();

    fireEvent.click(screen.getByRole('button', { name: /clear this device/i }));

    expect(clearPersistentCache).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('opens the report flow on demand and not before', async () => {
    renderBoundary();

    expect(screen.queryByText('report dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /report this issue/i }));

    expect(await screen.findByText('report dialog')).toBeTruthy();
  });

  it('gives every action a thumb-sized target', () => {
    renderBoundary();

    // Computed, not inline: sx lands in an emotion class, so element.style is empty.
    for (const name of [/try again/i, /report this issue/i, /clear this device/i]) {
      const button = screen.getByRole('button', { name });
      expect(window.getComputedStyle(button).minHeight).toBe('48px');
    }
  });
});

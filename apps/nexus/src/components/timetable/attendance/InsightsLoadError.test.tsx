import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import InsightsLoadError from './InsightsLoadError';

/**
 * What the Attended and Missed tabs show when the class could not be loaded.
 *
 * They used to show skeletons through SWR's retries and then an info note,
 * "Could not load this class.", with no way to try again short of closing the
 * drawer. On prod 2026-09-24 a teacher sat looking at the skeletons.
 */
describe('InsightsLoadError', () => {
  it('announces the failure and says what went wrong', () => {
    render(<InsightsLoadError message="Could not load the class" retrying={false} onRetry={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Could not load the class');
  });

  it('offers a way out that retries the load', () => {
    const onRetry = vi.fn();
    render(<InsightsLoadError message="x" retrying={false} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('holds the button while a retry is in flight, so it cannot be stacked', () => {
    const onRetry = vi.fn();
    render(<InsightsLoadError message="x" retrying onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: 'Trying again' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('falls back to a plain sentence when the server gave no message', () => {
    render(<InsightsLoadError message={null} retrying={false} onRetry={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load attendance for this class.');
  });
});

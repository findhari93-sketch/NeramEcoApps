import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';

/**
 * When a background poll finds the Microsoft session expired, the app used to
 * redirect to Microsoft on its own (PERF-0054). Now it says so and lets the user
 * choose the moment, without taking the cursor away from what they are typing.
 */

let auth: { sessionExpired: boolean; renewSession: ReturnType<typeof vi.fn<[], Promise<void>>> };
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

import SessionExpiredPrompt from './SessionExpiredPrompt';

beforeEach(() => {
  auth = { sessionExpired: false, renewSession: vi.fn<[], Promise<void>>(async () => {}) };
});

afterEach(() => cleanup());

describe('SessionExpiredPrompt', () => {
  it('shows nothing while the session is fine', () => {
    render(<SessionExpiredPrompt />);
    expect(screen.queryByText(/session has expired/i)).toBeNull();
  });

  it('tells the user politely, with a way to sign in again', () => {
    auth.sessionExpired = true;
    render(<SessionExpiredPrompt />);

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/session has expired/i);
    expect(status.textContent).toMatch(/copy anything you are typing/i);
    expect(screen.getByRole('button', { name: /sign in again/i })).toBeTruthy();
  });

  it('does not take the cursor away from someone typing', () => {
    const { rerender } = render(
      <>
        <textarea aria-label="feedback" />
        <SessionExpiredPrompt />
      </>,
    );
    const box = screen.getByLabelText('feedback');
    box.focus();

    auth.sessionExpired = true;
    rerender(
      <>
        <textarea aria-label="feedback" />
        <SessionExpiredPrompt />
      </>,
    );
    expect(document.activeElement).toBe(box);
  });

  it('signs in again only when the button is pressed', async () => {
    auth.sessionExpired = true;
    render(<SessionExpiredPrompt />);
    expect(auth.renewSession).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    });
    expect(auth.renewSession).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', async () => {
    auth.sessionExpired = true;
    render(<SessionExpiredPrompt />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    });
    // After the Snackbar's exit transition.
    await waitFor(() => expect(screen.queryByText(/session has expired/i)).toBeNull());
  });
});

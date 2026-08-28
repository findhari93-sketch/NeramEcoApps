import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecapPlayer from './RecapPlayer';

/**
 * Regression coverage for NXS-0119: RecapPlayer used to fetch its video-embed
 * URL with a raw fetch() closed over a token captured once by its parent, and
 * on failure dumped the server's raw error string straight into the player.
 * Once the Microsoft token expired mid-class, every "Try again" replayed the
 * same dead token and reproduced the identical raw error forever. The fix
 * routes this fetch through the app's shared useAuthFetch() hook, which
 * fetches a fresh token every call and turns a 401 into a friendly message.
 * These tests pin that behaviour at the component level, mocking useAuthFetch
 * directly so they don't depend on real MSAL/network plumbing.
 */

const authFetchMock = vi.fn();

vi.mock('@/components/curriculum/shared', () => ({
  useAuthFetch: () => authFetchMock,
}));

vi.mock('@/components/video/NeramVideoPlayer', () => ({
  default: ({ source }: { source: { kind: string; src?: string } }) => (
    <div data-testid="video-player">{source.kind === 'html5' ? source.src : 'youtube'}</div>
  ),
}));

const SECTIONS = [{ id: 's1', end_timestamp_seconds: 60, passed: false }];

const SUCCESS_RESPONSE = {
  mode: 'proxy',
  video_source: 'sharepoint',
  streamUrl: 'https://example.com/stream',
  src: 'https://example.com/stream',
  watermark: { name: 'Test Student', code: 'NX-000000' },
  resume_at: 0,
};

describe('RecapPlayer', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
  });

  it('fetches the video-embed URL through authFetch on mount, with no token/query param', async () => {
    authFetchMock.mockResolvedValueOnce(SUCCESS_RESPONSE);

    render(<RecapPlayer recapId="recap-1" sections={SECTIONS} onSectionEnd={() => {}} />);

    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    expect(authFetchMock).toHaveBeenCalledWith('/api/student/class-recaps/recap-1/video-embed');
  });

  it('shows the friendly session-expired message on a 401, not the raw upstream error', async () => {
    authFetchMock.mockRejectedValueOnce(new Error('Your session expired. Please sign in again.'));

    render(<RecapPlayer recapId="recap-1" sections={SECTIONS} onSectionEnd={() => {}} />);

    // findByText throws if no match, which is the presence assertion.
    await screen.findByText('Your session expired. Please sign in again.');
    expect(screen.queryByText(/InvalidAuthenticationToken/)).toBeNull();
    expect(screen.queryByText(/Lifetime validation/)).toBeNull();
  });

  it('"Try again" retries through authFetch, not a closure over a dead token', async () => {
    authFetchMock
      .mockRejectedValueOnce(new Error('Your session expired. Please sign in again.'))
      .mockResolvedValueOnce(SUCCESS_RESPONSE);

    render(<RecapPlayer recapId="recap-1" sections={SECTIONS} onSectionEnd={() => {}} />);

    const retryButton = await screen.findByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
    await screen.findByTestId('video-player');
  });

  it('renders the html5 source once authFetch resolves', async () => {
    authFetchMock.mockResolvedValueOnce(SUCCESS_RESPONSE);

    render(<RecapPlayer recapId="recap-1" sections={SECTIONS} onSectionEnd={() => {}} />);

    const player = await screen.findByTestId('video-player');
    expect(player.textContent).toBe('https://example.com/stream');
  });
});

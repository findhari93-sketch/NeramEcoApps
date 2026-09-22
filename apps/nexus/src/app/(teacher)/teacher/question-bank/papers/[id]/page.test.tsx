import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * The paper page must never leave a teacher on a skeleton or a false "not found".
 *
 * It used to have two outcomes for every failure: a skeleton for as long as the
 * request stayed open (up to Cloudflare's 100s cut-off, a 524), then "Paper not
 * found" for a 500, a 524, a dropped connection or a missing token alike, with
 * no way to retry. Production showed exactly that skeleton while the shell's
 * other endpoints were timing out.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'paper-1' }),
  usePathname: () => '/teacher/question-bank/papers/paper-1',
  useSearchParams: () => new URLSearchParams(),
}));

// One stable context object, as the real provider gives: a getToken that changed
// identity on every render would refire the page's fetch effect in a loop.
const authContext = {
  getToken: async () => 'token',
  tokenReady: true,
  can: () => true,
  user: { id: 'u1', name: 'Teacher' },
  activeClassroom: null,
  classrooms: [],
};
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => authContext,
}));

import PaperDetailPage from './page';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('paper page load failures', () => {
  it('says the paper could not be loaded, not that it is missing, when the server fails', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"timeout"}', { status: 524 }));
    render(<PaperDetailPage />);
    expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText(/not found/i)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('retries on Try again', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    render(<PaperDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('reports a dropped connection as a load failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PaperDetailPage />);
    expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
  });

  it('says not found only for a 404, and offers the way back', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"Paper not found"}', { status: 404 }));
    render(<PaperDetailPage />);
    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('link', { name: /back to question bank/i }).getAttribute('href')).toBe('/teacher/question-bank');
  });
});

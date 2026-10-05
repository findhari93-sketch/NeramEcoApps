import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { RoundResults as Results } from '@/lib/pad/round-results';
import PresenterBanner from './PresenterBanner';
import RoundResults from './RoundResults';

const mocks = vi.hoisted(() => ({ padFetch: vi.fn(), copyText: vi.fn() }));
vi.mock('@/lib/clipboard', () => ({ copyText: mocks.copyText }));
vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

const host: PadHost = {
  kind: 'test',
  meeting: { meetingId: 'm1', chatId: null, channelId: null },
  frame: 'sidePanel',
  theme: 'light',
  getToken: async () => 't',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
};

const NO_DASHES = /[–—]|--/;

function results(overrides: Partial<Results['session']> = {}): Results {
  return {
    session: {
      id: 's1',
      status: 'ended',
      round_no: 1,
      classroom_name: 'JEE B.Arch Session 1',
      scheduled_class_id: 'c1',
      created_at: '2026-09-30T13:43:00Z',
      ended_at: '2026-09-30T14:46:00Z',
      results_published_at: null,
      changed_since_publish: false,
      ...overrides,
    },
    class: { questions: 18, graded: 17, pending_keys: 1, joined: 22, took_part: 21, enrolled: 39, average_score: 61 },
    top: [
      { student_id: 'a', name: 'Asha', rank: 1, correct: 15, counted: 17 },
      { student_id: 'b', name: 'Bala', rank: 2, correct: 14, counted: 17 },
    ],
    students: [
      { student_id: 'a', name: 'Asha', correct: 15, wrong: 2, no_answer: 0, excused: 0, away: 0, counted: 17, attempted: 17, answered: 17, present_for: 17, score_pct: 88, accuracy_pct: 88, participation_pct: 100, label: 'strong', not_active: false, rank: 1, ranked_of: 22 },
      { student_id: 'b', name: 'Bala', correct: 14, wrong: 3, no_answer: 0, excused: 0, away: 0, counted: 17, attempted: 17, answered: 17, present_for: 17, score_pct: 82, accuracy_pct: 82, participation_pct: 100, label: 'strong', not_active: false, rank: 2, ranked_of: 22 },
      { student_id: 'z', name: 'Zara', correct: 2, wrong: 1, no_answer: 12, excused: 1, away: 1, counted: 15, attempted: 3, answered: 3, present_for: 15, score_pct: 13, accuracy_pct: 67, participation_pct: 20, label: 'needs_practice', not_active: true, rank: 21, ranked_of: 22 },
    ],
  };
}

const share = { allowed: true, sharing: false, busy: false, toggle: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  mocks.padFetch.mockReset();
});

describe('RoundResults', () => {
  it('shows the class, the top five, and everyone (only to the teacher), then publishes after a confirm', async () => {
    let current = results();
    mocks.padFetch.mockImplementation(async (_host: PadHost, path: string) => {
      if (path === '/api/pad/sessions/s1/results') return current;
      if (path === '/api/pad/sessions/s1/publish') {
        current = results({ results_published_at: '2026-09-30T14:50:00Z' });
        return { publishedAt: '2026-09-30T14:50:00Z', notified: 21 };
      }
      throw new Error(path);
    });
    render(<RoundResults host={host} sessionId="s1" share={share} onNextRound={vi.fn()} nextRoundBusy={false} />);

    expect(await screen.findByRole('heading', { name: 'Round 1 results' })).toBeTruthy();
    expect(screen.getByText('61%')).toBeTruthy();
    expect(screen.getByText('21 of 22')).toBeTruthy();
    expect(screen.getByText(/1 question has no answer yet/)).toBeTruthy();
    expect(screen.getByText('Asha')).toBeTruthy();
    // The low score is behind "Everyone", for the teacher only.
    expect(screen.queryByText('Zara')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Everyone (3), only you see this' }));
    expect(await screen.findByText('Zara')).toBeTruthy();
    expect(screen.getByText('2 of 3 right, 12 not attempted')).toBeTruthy();
    expect(screen.getByText('Needs practice')).toBeTruthy();
    expect(screen.getByText('Not active')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Publish results' }));
    expect(screen.getByText(/Nobody sees anyone else's score/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Published. 21 students were sent their result.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Show the top 5 on the meeting screen' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('offers to publish again when results changed after publishing, and starts the next round', async () => {
    mocks.padFetch.mockResolvedValue(results({ results_published_at: '2026-09-30T14:50:00Z', changed_since_publish: true }));
    const onNextRound = vi.fn();
    render(<RoundResults host={host} sessionId="s1" share={{ ...share, allowed: false }} onNextRound={onNextRound} nextRoundBusy={false} />);

    expect(await screen.findByText('Results changed after you published.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /meeting screen/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start Round 2' }));
    expect(onNextRound).toHaveBeenCalledTimes(1);
  });

  it("opens the full report inside Teams where it can, so it is never the browser's other account", async () => {
    mocks.padFetch.mockResolvedValue(results());
    const openReport = vi.fn(async () => undefined);
    render(<RoundResults host={{ ...host, openReport }} sessionId="s1" share={share} nextRoundBusy={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the full report' }));
    await waitFor(() => expect(openReport).toHaveBeenCalledWith('s1'));
  });

  it('links to the Nexus report outside Teams, and copies the link', async () => {
    mocks.padFetch.mockResolvedValue(results());
    mocks.copyText.mockReset().mockResolvedValue(true);
    render(<RoundResults host={host} sessionId="s1" share={share} nextRoundBusy={false} />);
    const link = await screen.findByRole('link', { name: 'Open the full report' });
    expect(link.getAttribute('href')).toBe('/teacher/answer-pad/sessions/s1');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the report link' }));
    await waitFor(() => expect(mocks.copyText).toHaveBeenCalledWith(`${window.location.origin}/teacher/answer-pad/sessions/s1`));
    expect(await screen.findByText('Link copied')).toBeTruthy();
  });

  it('hides names on request', async () => {
    mocks.padFetch.mockResolvedValue(results());
    render(<RoundResults host={host} sessionId="s1" share={share} onNextRound={vi.fn()} nextRoundBusy={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hide names' }));
    await waitFor(() => expect(screen.queryByText('Asha')).toBeNull());
    expect(screen.getByText('Names are hidden.')).toBeTruthy();
  });
});

describe('PresenterBanner', () => {
  it('warns when students can present, and locks it in one tap', async () => {
    mocks.padFetch.mockImplementation(async (_host: PadHost, _path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? { state: 'locked', allowedPresenters: 'organizer', canFix: true } : { state: 'open', allowedPresenters: 'everyone', canFix: true },
    );
    render(<PresenterBanner host={host} sessionId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Only I can present' }));
    expect(await screen.findByText('Only you can present now. Students cannot share over your screen.')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/sessions/s1/presenters', { method: 'POST' });
  });

  it('says how to do it by hand when the meeting cannot be changed from here', async () => {
    mocks.padFetch.mockImplementation(async (_host: PadHost, _path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? { state: 'unknown', allowedPresenters: null, canFix: false } : { state: 'open', allowedPresenters: 'everyone', canFix: true },
    );
    render(<PresenterBanner host={host} sessionId="s1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Only I can present' }));
    expect(await screen.findByText(/set Who can present to Only me/)).toBeTruthy();
  });

  it('says nothing when the meeting is already locked, or cannot be read', async () => {
    mocks.padFetch.mockResolvedValue({ state: 'locked', allowedPresenters: 'organizer', canFix: true });
    const { container, unmount } = render(<PresenterBanner host={host} sessionId="s1" />);
    await waitFor(() => expect(mocks.padFetch).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    unmount();

    mocks.padFetch.mockRejectedValue(new Error('offline'));
    const second = render(<PresenterBanner host={host} sessionId="s1" />);
    await waitFor(() => expect(mocks.padFetch).toHaveBeenCalledTimes(2));
    expect(second.container.textContent).toBe('');
  });
});

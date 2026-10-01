import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { StageView } from '@/lib/pad/stage';
import StageResults, { stageAnnouncement } from './StageResults';

/**
 * The shared meeting screen: the network and Realtime are replaced, so each
 * state the class sees can be checked without running a class.
 */

const mocks = vi.hoisted(() => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { padFetch: vi.fn(), client: { channel: () => channel, removeChannel: async () => undefined } };
});

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));
vi.mock('@neram/database', () => ({ getSupabaseBrowserClient: () => mocks.client }));

const host = (meetingId: string | null = 'MCMxOTptZWV0aW5n/x+y=='): PadHost => ({
  kind: 'test',
  meeting: meetingId ? { meetingId, chatId: null, channelId: null } : null,
  frame: 'meetingStage',
  theme: 'dark',
  getToken: async () => 'token',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
});

function stage(prompt: StageView['prompt']): StageView {
  return {
    server_time: '2026-09-11T10:00:05Z',
    session: { id: 's1', status: 'live', classroom_name: 'NATA Evening Batch', hint_topic: 'pad-hint-x' },
    prompt,
  };
}

const OPEN: NonNullable<StageView['prompt']> = {
  id: 'p1',
  sequence: 3,
  label: null,
  state: 'open',
  version: 1,
  answer_type: 'mcq',
  answered: 23,
  enrolled: 31,
  reveal: null,
};
const NO_DASHES = /[–—]|--/;

const RESULTS: StageView = {
  server_time: '2026-09-11T10:30:00Z',
  session: { id: 's1', status: 'ended', classroom_name: 'NATA Evening Batch', hint_topic: '' },
  prompt: null,
  results: {
    round_no: 2,
    top: [
      { name: 'Asha', rank: 1, correct: 15, counted: 18 },
      { name: 'Bala', rank: 2, correct: 14, counted: 18 },
      { name: 'Chitra', rank: 2, correct: 14, counted: 17 },
      { name: 'Dev', rank: 4, correct: 12, counted: 18 },
      { name: 'Ezhil', rank: 5, correct: 11, counted: 18 },
      { name: 'Sixth', rank: 6, correct: 10, counted: 18 },
    ],
    average_score: 61,
    took_part: 22,
    questions: 18,
  },
};

beforeEach(() => {
  mocks.padFetch.mockReset();
});

describe('StageResults', () => {
  it('asks for the live session of this meeting, and says so when none is running', async () => {
    mocks.padFetch.mockResolvedValue({ stage: null });
    render(<StageResults host={host()} />);
    expect(await screen.findByText('The Answer Pad is not running')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(expect.anything(), `/api/pad/stage?meetingId=${encodeURIComponent('MCMxOTptZWV0aW5n/x+y==')}`);
  });

  it('shows how many have answered while the question is open, and nothing else', async () => {
    mocks.padFetch.mockResolvedValue({ stage: stage(OPEN) });
    render(<StageResults host={host()} />);
    expect(await screen.findByText('Question 3 is open')).toBeTruthy();
    expect(screen.getByText('23 of 31')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'How the class answered' })).toBeNull();
  });

  it('after the reveal shows the answer, the totals and the breakdown, marking the correct choice in words as well as colour', async () => {
    mocks.padFetch.mockResolvedValue({
      stage: stage({
        ...OPEN,
        state: 'revealed',
        version: 4,
        reveal: {
          ungraded: false,
          correct_keys: ['B'],
          distribution: [
            { value: 'A', count: 6 },
            { value: 'B', count: 15 },
            { value: 'C', count: 0 },
            { value: 'D', count: 2 },
          ],
          others: 0,
          correct: 15,
          incorrect: 8,
        },
      }),
    });
    render(<StageResults host={host()} />);

    expect(await screen.findByText('Answer: B')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Correct: 15' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Incorrect: 8' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'B: 15, correct' })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'C: 0' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('shows a poll without right or wrong', async () => {
    mocks.padFetch.mockResolvedValue({
      stage: stage({
        ...OPEN,
        answer_type: 'yesno',
        state: 'revealed',
        reveal: { ungraded: true, correct_keys: [], distribution: [{ value: 'yes', count: 18 }, { value: 'no', count: 5 }], others: 0, correct: 0, incorrect: 0 },
      }),
    });
    render(<StageResults host={host()} />);
    expect(await screen.findByText('Question 3 poll results')).toBeTruthy();
    expect(screen.getByText('23 of 31 answered. Not graded.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Correct/ })).toBeNull();
  });

  it('between rounds shows the published top five by name, the class average and who took part, and nobody else', async () => {
    mocks.padFetch.mockResolvedValue({ stage: RESULTS });
    render(<StageResults host={host()} />);

    expect(await screen.findByRole('heading', { name: 'Round 2 results' })).toBeTruthy();
    expect(screen.getByText('NATA Evening Batch')).toBeTruthy();
    const top = screen.getByRole('list', { name: 'Top five' });
    const rows = within(top).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0].getAttribute('aria-label')).toBe('Rank 1: Asha, 15 of 18 correct');
    // Ties share a rank.
    expect(rows[1].getAttribute('aria-label')).toBe('Rank 2: Bala, 14 of 18 correct');
    expect(rows[2].getAttribute('aria-label')).toBe('Rank 2: Chitra, 14 of 17 correct');
    expect(screen.queryByText('Sixth')).toBeNull();
    expect(screen.getByRole('group', { name: 'Class average: 61%' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Took part: 22' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Questions: 18' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('says so gently when nobody made the top five', async () => {
    mocks.padFetch.mockResolvedValue({ stage: { ...RESULTS, results: { ...RESULTS.results!, top: [], average_score: null } } });
    render(<StageResults host={host()} />);
    expect(await screen.findByText('No top five this round. The next round is a fresh start.')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Class average: Not graded' })).toBeTruthy();
  });

  it('explains itself outside a meeting and fetches nothing', async () => {
    render(<StageResults host={host(null)} />);
    expect(screen.getByText('Share this from a class meeting')).toBeTruthy();
    await waitFor(() => expect(mocks.padFetch).not.toHaveBeenCalled());
  });
});

describe('stageAnnouncement', () => {
  it('names the change without reading out the live count', () => {
    expect(stageAnnouncement(null)).toBe('The Answer Pad is not running in this meeting.');
    expect(stageAnnouncement(stage(null))).toBe('Waiting for the first question.');
    expect(stageAnnouncement(stage(OPEN))).toBe('Question 3 is open.');
    expect(stageAnnouncement(stage({ ...OPEN, state: 'closed' }))).toBe('Question 3 closed.');
    expect(stageAnnouncement(RESULTS)).toBe('Round 2 results are up.');
  });
});

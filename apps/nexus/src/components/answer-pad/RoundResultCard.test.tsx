import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { RoundQuestionResult, RoundStudentRow, RoundTopRow, StudentRoundResult } from '@/lib/pad/round-results';
import RoundResultCard from './RoundResultCard';

/**
 * A student's published round result: attempted, not attempted, right and
 * their own rank, each question folded underneath. What it never shows is
 * anyone else's score outside the top five.
 */

const mocks = vi.hoisted(() => ({ padFetch: vi.fn() }));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ name }: { name?: string | null }) => <span data-testid="avatar">{name}</span>,
}));

const host: PadHost = {
  kind: 'test',
  meeting: null,
  frame: 'sidePanel',
  theme: 'light',
  getToken: async () => 'token',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
};

const NO_DASHES = /[–—]|--/;

function me(overrides: Partial<RoundStudentRow> = {}): RoundStudentRow {
  return {
    student_id: 'me',
    name: 'Asha Raman',
    correct: 12,
    wrong: 4,
    no_answer: 2,
    excused: 0,
    away: 0,
    counted: 18,
    attempted: 16,
    answered: 16,
    present_for: 18,
    score_pct: 67,
    accuracy_pct: 75,
    participation_pct: 89,
    label: 'good',
    not_active: false,
    rank: 7,
    ranked_of: 22,
    in_top: false,
    ...overrides,
  };
}

const TOP: RoundTopRow[] = [
  { student_id: 'a', name: 'Divya', rank: 1, correct: 17, counted: 18 },
  { student_id: 'b', name: 'Karthik', rank: 2, correct: 16, counted: 18 },
  { student_id: 'c', name: 'Meena', rank: 3, correct: 15, counted: 18 },
  { student_id: 'd', name: 'Rahul', rank: 4, correct: 15, counted: 18 },
  { student_id: 'e', name: 'Sara', rank: 5, correct: 14, counted: 18 },
];

const QUESTIONS: RoundQuestionResult[] = [
  { prompt_id: 'p1', sequence: 1, label: '31', answer_type: 'mcq', your_answer: 'B', correct_keys: ['B'], result: 'right' },
  { prompt_id: 'p2', sequence: 2, label: '32', answer_type: 'mcq', your_answer: 'A', correct_keys: ['C'], result: 'wrong' },
  { prompt_id: 'p3', sequence: 3, label: '33', answer_type: 'mcq', your_answer: null, correct_keys: ['D'], result: 'not_attempted' },
  { prompt_id: 'p4', sequence: 4, label: '34', answer_type: 'mcq', your_answer: null, correct_keys: ['A'], result: 'away' },
];

function published(overrides: Partial<StudentRoundResult> = {}): StudentRoundResult {
  return {
    published: true,
    status: 'ended',
    round_no: 2,
    published_at: '2026-09-10T11:00:00Z',
    me: me(),
    top: TOP,
    questions: QUESTIONS,
    class: { questions: 18, graded: 18, took_part: 22, average_score: 61 },
    ...overrides,
  };
}

const card = () => <RoundResultCard host={host} sessionId="s1" roundNo={2} />;

beforeEach(() => {
  mocks.padFetch.mockReset();
});

describe('RoundResultCard', () => {
  it('shows a skeleton while the result loads, then attempted, not attempted, right, rank, label and class average', async () => {
    let resolve: (value: StudentRoundResult) => void = () => undefined;
    mocks.padFetch.mockReturnValue(new Promise<StudentRoundResult>((r) => (resolve = r)));
    render(card());

    expect(screen.getByLabelText('Loading your result')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/sessions/s1/my-result');

    resolve(published());
    const grid = await screen.findByLabelText('Your numbers');
    const cells = within(grid)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.parentElement?.querySelector('dd')?.textContent]);
    expect(cells).toEqual([
      ['Attempted', '16'],
      ['Not attempted', '2'],
      ['Right', '12 of 16'],
      ['Rank', '7 of 22'],
    ]);
    expect(screen.getByText('Good')).toBeTruthy();
    expect(screen.getByText('75% of your attempts were right')).toBeTruthy();
    expect(screen.getByText('18 questions counted for you.')).toBeTruthy();
    expect(screen.getByText('Class average 61%')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your Round 2 result' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('lists at most five, never anyone outside it, and shows the student only their own rank', async () => {
    const extra: RoundTopRow = { student_id: 'f', name: 'Vijay', rank: 6, correct: 13, counted: 18 };
    mocks.padFetch.mockResolvedValue(published({ top: [...TOP, extra] }));
    render(card());

    const list = await screen.findByRole('list', { name: 'Top five' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(screen.queryByText('Vijay')).toBeNull();
    expect(screen.queryByText('13 of 18')).toBeNull();
    // Not in the top five: no highlighted row, no "(you)", but their own rank in the grid.
    expect(rows.some((row) => row.getAttribute('aria-current') === 'true')).toBe(false);
    expect(screen.queryByText(/\(you\)/)).toBeNull();
    expect(screen.getByText('7 of 22')).toBeTruthy();
  });

  it("highlights the student's own row when they are in the top five", async () => {
    const top = TOP.map((row) => (row.student_id === 'c' ? { ...row, student_id: 'me', name: 'Asha Raman' } : row));
    mocks.padFetch.mockResolvedValue(published({ me: me({ correct: 15, in_top: true, label: 'strong', rank: 3 }), top }));
    render(card());

    const list = await screen.findByRole('list', { name: 'Top five' });
    const mine = within(list)
      .getAllByRole('listitem')
      .filter((row) => row.getAttribute('aria-current') === 'true');
    expect(mine).toHaveLength(1);
    expect(mine[0].textContent).toContain('Asha Raman (you)');
    expect(mine[0].textContent).toContain('Rank 3');
    expect(mine[0].textContent).toContain('15 of 18');
    expect(screen.getByText('Strong')).toBeTruthy();
  });

  it('tells a student who hardly answered gently, as a warning, not an error', async () => {
    mocks.padFetch.mockResolvedValue(
      published({ me: me({ answered: 5, not_active: true, correct: 3, counted: 18, label: 'needs_practice' }) }),
    );
    render(card());

    const note = await screen.findByText('You answered 5 of 18 questions. Answer every question next time, a guess is fine.');
    expect(note.closest('.MuiAlert-standardWarning')).toBeTruthy();
    expect(screen.getByText('Needs practice')).toBeTruthy();
    expect(screen.queryByText(/poor/i)).toBeNull();
    expect(document.querySelector('.MuiAlert-standardError')).toBeNull();
  });

  it('folds each question under the summary: their answer, the right one, and how it went', async () => {
    mocks.padFetch.mockResolvedValue(published());
    render(card());

    const toggle = await screen.findByRole('button', { name: 'See each question (4)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Each question' })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide the questions' }).getAttribute('aria-expanded')).toBe('true');
    const rows = within(screen.getByRole('list', { name: 'Each question' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Q.31RightYou: B. Answer: B',
      'Q.32WrongYou: A. Answer: C',
      'Q.33Not attemptedYou: No answer. Answer: D',
      'Q.34Away',
    ]);
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('still shows a rank and a gentle line for a student who joined but answered nothing', async () => {
    mocks.padFetch.mockResolvedValue(
      published({
        me: me({ correct: 0, wrong: 0, attempted: 0, no_answer: 18, answered: 0, accuracy_pct: null, score_pct: 0, label: 'needs_practice', not_active: true, rank: 22 }),
      }),
    );
    render(card());
    expect(await screen.findByText('22 of 22')).toBeTruthy();
    expect(screen.queryByText(/of your attempts were right/)).toBeNull();
    expect(screen.getByText('You answered 0 of 18 questions. Answer every question next time, a guess is fine.')).toBeTruthy();
  });

  it('says results are coming when the round is not published yet', async () => {
    mocks.padFetch.mockResolvedValue({ published: false, status: 'ended', round_no: 2 });
    render(card());
    expect(await screen.findByText('Round 2 has ended. Your teacher will share the results soon.')).toBeTruthy();
  });

  it('shows no top five list when nobody made it, and no class average when nothing was graded', async () => {
    mocks.padFetch.mockResolvedValue(published({ top: [], class: { questions: 3, graded: 0, took_part: 10, average_score: null } }));
    render(card());
    await screen.findByText('12 of 16');
    expect(screen.queryByRole('list', { name: 'Top five' })).toBeNull();
    expect(screen.queryByText(/Class average/)).toBeNull();
  });

  it('offers a retry when the result cannot load', async () => {
    mocks.padFetch.mockRejectedValueOnce(new PadClientError(0, 'OFFLINE', 'No connection')).mockResolvedValueOnce(published());
    render(card());

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('12 of 16')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledTimes(2);
  });
});

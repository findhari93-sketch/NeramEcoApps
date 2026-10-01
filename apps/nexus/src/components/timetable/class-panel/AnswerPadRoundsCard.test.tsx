import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import AnswerPadRoundsCard, { teacherRoundLine, type StudentRound, type TeacherRound } from './AnswerPadRoundsCard';

/**
 * The After tab's Answer Pad card. What matters:
 *  - it draws nothing for a class that never ran the pad,
 *  - a teacher sees every round with its numbers and publish state, each
 *    opening the round's report,
 *  - a student sees attempted, right and their own rank, and the top five,
 *    never anyone else's score outside it.
 */

let status = 200;
let body: unknown = null;

beforeEach(() => {
  status = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as unknown as Response),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <AnswerPadRoundsCard classId="c1" getToken={async () => 't'} />
    </SWRConfig>,
  );
}

const TOP = [
  { student_id: 'a', name: 'Asha', rank: 1, correct: 15, counted: 18 },
  { student_id: 'b', name: 'Bala', rank: 2, correct: 14, counted: 18 },
  { student_id: 'me', name: 'Meena', rank: 2, correct: 14, counted: 18 },
  { student_id: 'd', name: 'Dev', rank: 4, correct: 12, counted: 18 },
  { student_id: 'e', name: 'Ezhil', rank: 5, correct: 11, counted: 18 },
];

function teacherRound(over: Partial<TeacherRound> = {}): TeacherRound {
  return {
    session_id: 's1',
    round_no: 1,
    status: 'ended',
    created_at: '2026-09-30T10:00:00Z',
    ended_at: '2026-09-30T10:30:00Z',
    results_published_at: null,
    class: { questions: 18, graded: 18, pending_keys: 0, joined: 24, took_part: 22, enrolled: 30, average_score: 61, average_participation: 80 },
    top: TOP,
    ...over,
  };
}

function studentRound(over: Partial<StudentRound> = {}): StudentRound {
  return {
    session_id: 's1',
    round_no: 1,
    results_published_at: '2026-09-30T11:00:00Z',
    me: {
      student_id: 'me',
      correct: 14,
      counted: 18,
      attempted: 16,
      no_answer: 2,
      answered: 16,
      present_for: 18,
      score_pct: 78,
      label: 'strong',
      not_active: false,
      rank: 2,
      ranked_of: 22,
      in_top: true,
    },
    top: TOP,
    class: { questions: 18, graded: 18, took_part: 22, average_score: 61 },
    ...over,
  };
}

const NO_DASHES = /[–—]|--/;

describe('AnswerPadRoundsCard', () => {
  it('draws nothing when the class ran no rounds', async () => {
    body = { role: 'teacher', rounds: [] };
    const { container } = renderCard();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/timetable/c1/answer-pad', expect.anything()));
    // Let SWR settle, then check nothing was drawn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe('');
  });

  it('shows the teacher every round with its numbers and publish state, each opening its report', async () => {
    body = {
      role: 'teacher',
      rounds: [
        teacherRound({ results_published_at: '2026-09-30T11:00:00Z' }),
        teacherRound({ session_id: 's2', round_no: 2, status: 'ended', class: { ...teacherRound().class, questions: 1, pending_keys: 2, average_score: null } }),
      ],
    };
    renderCard();

    const section = await screen.findByRole('region', { name: 'Answer Pad' });
    const one = within(section).getByRole('link', { name: /^Round 1 · 18 questions · average 61% · 22 took part\. Published/ });
    expect(one.getAttribute('href')).toBe('/teacher/answer-pad/sessions/s1');
    const two = within(section).getByRole('link', { name: /^Round 2 · 1 question · no score yet · 22 took part\. Not published/ });
    expect(two.getAttribute('href')).toBe('/teacher/answer-pad/sessions/s2');
    expect(within(section).getByText('2 questions need their answers set')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('shows a student their own marks, the label, and the top five with their own row marked', async () => {
    body = { role: 'student', rounds: [studentRound()] };
    renderCard();

    const section = await screen.findByRole('region', { name: 'Your Answer Pad' });
    expect(within(section).getByText('Round 1')).toBeTruthy();
    expect(within(section).getByText('Attempted 16 of 18 · 14 right · Rank 2 of 22')).toBeTruthy();
    expect(within(section).getByText('Strong')).toBeTruthy();
    expect(within(section).getByText('Class average 61%.')).toBeTruthy();
    const top = within(section).getByRole('list', { name: 'Top five' });
    expect(within(top).getAllByRole('listitem')).toHaveLength(5);
    expect(within(top).getByRole('listitem', { name: 'Rank 2: Meena (you), 14 of 18 correct' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_DASHES);
  });

  it('gives a student outside the top five only their own rank, and nudges gently when they hardly answered', async () => {
    body = {
      role: 'student',
      rounds: [
        studentRound({
          top: TOP.filter((row) => row.student_id !== 'me'),
          me: {
            student_id: 'me',
            correct: 3,
            counted: 18,
            attempted: 4,
            no_answer: 14,
            answered: 4,
            present_for: 18,
            score_pct: 17,
            label: 'needs_practice',
            not_active: true,
            rank: 19,
            ranked_of: 22,
            in_top: false,
          },
        }),
      ],
    };
    renderCard();

    const section = await screen.findByRole('region', { name: 'Your Answer Pad' });
    expect(within(section).getByText('Attempted 4 of 18 · 3 right · Rank 19 of 22')).toBeTruthy();
    expect(within(section).getByText('Needs practice')).toBeTruthy();
    expect(within(section).getByText('Answer every question next time, a guess is fine.')).toBeTruthy();
    expect(within(section).queryByText(/\(you\)/)).toBeNull();
    // Nobody else outside the top five is named or scored.
    expect(within(section).queryAllByText(/Rank \d+ of/)).toHaveLength(1);
  });

  it('tells a student who did not join, without inventing marks', async () => {
    body = { role: 'student', rounds: [studentRound({ me: null })] };
    renderCard();
    const section = await screen.findByRole('region', { name: 'Your Answer Pad' });
    expect(within(section).getByText('You did not join this round. Class average 61%.')).toBeTruthy();
  });

  it('offers a retry when the server fails', async () => {
    status = 500;
    body = { error: 'boom' };
    renderCard();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    status = 200;
    body = { role: 'teacher', rounds: [teacherRound()] };
    fireEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Answer Pad' })).toBeTruthy();
  });
});

describe('teacherRoundLine', () => {
  it('reads as one line', () => {
    expect(teacherRoundLine(teacherRound())).toBe('Round 1 · 18 questions · average 61% · 22 took part');
  });
});

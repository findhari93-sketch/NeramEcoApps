import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_CSV_HEADERS, type SessionReport } from '@/lib/pad/client/report';
import type { RoundResults } from '@/lib/pad/round-results';
import AnswerPadReportPage from './page';

/**
 * The class report page: the totals, both tables and the CSV all come from one
 * answer of GET /api/pad/sessions/:id/report. Sign-in, the network and the
 * download are replaced.
 */

const mocks = vi.hoisted(() => ({
  auth: { tokenReady: true, getToken: vi.fn() },
  fetch: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => mocks.auth }));
vi.mock('@/lib/csv-export', () => ({ downloadCsv: mocks.downloadCsv }));
// A face is not what these tests are about, and the real avatar reads the network.
vi.mock('@/components/students/StudentAvatar', () => ({ default: () => null }));

const COUNTS = { enrolled: 3, answered: 2, silent: 1, absent: 0, correct: 1, incorrect: 1, answered_off_roster: 0 };

function report(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    ok: true,
    session: {
      id: 's1',
      status: 'ended',
      classroom_id: 'c1',
      classroom_name: 'NATA Evening Batch',
      scheduled_class_id: null,
      created_at: '2026-09-10T15:00:00Z',
      ended_at: '2026-09-10T16:00:00Z',
      enrolled: 3,
    },
    prompts: [
      {
        id: 'p1',
        sequence: 1,
        label: 'Warm-up',
        question_text: null,
        image_url: null,
        answer_type: 'mcq',
        option_count: 4,
        state: 'revealed',
        ungraded: false,
        correct_keys: ['B'],
        opened_at: '2026-09-10T15:05:00Z',
        closed_at: '2026-09-10T15:06:00Z',
        revealed_at: '2026-09-10T15:07:00Z',
        counts: COUNTS,
        groups: [
          { value: 'B', count: 1 },
          { value: 'A', count: 1 },
        ],
        skips: {},
      },
      {
        id: 'p2',
        sequence: 2,
        label: '38',
        question_text: 'Is the latitude measured from the equator?',
        image_url: 'https://db.neramclasses.com/storage/v1/object/public/uploads/pad/s1/q38.jpg',
        answer_type: 'yesno',
        option_count: null,
        state: 'closed',
        ungraded: false,
        correct_keys: null,
        opened_at: '2026-09-10T15:10:00Z',
        closed_at: '2026-09-10T15:11:00Z',
        revealed_at: null,
        counts: COUNTS,
        groups: [
          { value: 'yes', count: 2 },
          { value: 'no', count: 1 },
        ],
        skips: { dont_know: 1 },
      },
    ],
    students: [
      { student_id: 'a', name: 'Asha', on_roster: true, answered: 2, silent: 0, absent: 0, correct: 1, wrong: 0, skipped: 0, total_graded: 1 },
      { student_id: 'b', name: 'Bala', on_roster: true, answered: 0, silent: 0, absent: 2, correct: 0, wrong: 0, skipped: 0, total_graded: 0 },
      { student_id: 'v', name: 'Visitor', on_roster: false, answered: 1, silent: 0, absent: 1, correct: 0, wrong: 1, skipped: 0, total_graded: 1 },
    ],
    ...overrides,
  };
}

function answer(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function results(overrides: Partial<RoundResults['session']> = {}): RoundResults {
  return {
    session: {
      id: 's1',
      status: 'ended',
      round_no: 2,
      classroom_name: 'NATA Evening Batch',
      scheduled_class_id: 'k1',
      created_at: '2026-09-10T15:00:00Z',
      ended_at: '2026-09-10T16:00:00Z',
      results_published_at: null,
      changed_since_publish: false,
      ...overrides,
    },
    class: { questions: 18, graded: 16, took_part: 2, enrolled: 3, average_score: 61, average_participation: 90 },
    top: [{ student_id: 'a', name: 'Asha', rank: 1, correct: 15, counted: 16 }],
    students: [
      { student_id: 'b', name: 'Bala', correct: 4, wrong: 10, no_answer: 2, excused: 0, away: 0, counted: 16, attempted: 14, answered: 14, present_for: 16, score_pct: 25, accuracy_pct: 29, participation_pct: 88, label: 'needs_practice', not_active: false, rank: 2, ranked_of: 3 },
      { student_id: 'z', name: 'Zara', correct: 0, wrong: 0, no_answer: 16, excused: 0, away: 0, counted: 16, attempted: 0, answered: 0, present_for: 16, score_pct: 0, accuracy_pct: null, participation_pct: 0, label: 'needs_practice', not_active: true, rank: 3, ranked_of: 3 },
      { student_id: 'a', name: 'Asha', correct: 15, wrong: 1, no_answer: 0, excused: 0, away: 0, counted: 16, attempted: 16, answered: 16, present_for: 16, score_pct: 94, accuracy_pct: 94, participation_pct: 100, label: 'strong', not_active: false, rank: 1, ranked_of: 3 },
    ],
  };
}

/** Answers each route the page calls; anything unlisted answers with the report. */
function routes(map: Record<string, () => ReturnType<typeof answer>>) {
  mocks.fetch.mockImplementation(async (path: string) => (map[path] ? map[path]() : answer(200, report())));
}

beforeEach(() => {
  mocks.auth.tokenReady = true;
  mocks.auth.getToken.mockReset().mockResolvedValue('nexus-token');
  mocks.fetch.mockReset().mockResolvedValue(answer(200, report()));
  mocks.downloadCsv.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Answer Pad report page', () => {
  it('shows the totals, each question and each student, with the Nexus token', async () => {
    render(<AnswerPadReportPage />);

    expect(await screen.findByRole('heading', { name: 'Answer Pad report' })).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/pad/sessions/s1/report', expect.objectContaining({ headers: { Authorization: 'Bearer nexus-token' } }));

    expect(screen.getByText('1 question has no answer yet, so it is not graded. Set it below and every score updates.')).toBeTruthy();
    // Class score counts the class list only: Asha 1 of 1, the visitor is left out.
    expect(within(screen.getByText('Class score').parentElement as HTMLElement).getByText('100%')).toBeTruthy();

    const questions = screen.getByRole('table', { name: 'Each question, its answer and how the class responded' });
    expect(within(questions).getByRole('rowheader', { name: 'Warm-up' })).toBeTruthy();
    expect(within(questions).getByRole('rowheader', { name: /^Q\.38/ })).toBeTruthy();
    expect(within(questions).getByRole('button', { name: 'Set the answer' })).toBeTruthy();
    expect(within(questions).getByRole('button', { name: 'Show the picture for Q.38' })).toBeTruthy();
    expect(within(questions).getByText("1 can't answer: 1 don't know")).toBeTruthy();
    expect(within(questions).getAllByText('2 of 3')).toHaveLength(2);

    const students = screen.getByRole('table', { name: "Each student's participation and score" });
    const bala = within(students).getByRole('row', { name: /Bala/ });
    expect(within(bala).getByText('No score')).toBeTruthy();
    expect(within(students).getByText('Not on class list')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });

  // The teacher checked the answer after class; the report reveals it and reloads the scores.
  it('sets the answer to a question left for later, after the class has ended', async () => {
    mocks.fetch.mockImplementation(async (path: string) => {
      if (path === '/api/pad/prompts/p2/key') return answer(200, { promptId: 'p2', state: 'closed', version: 3, changed: true });
      return answer(200, report());
    });
    render(<AnswerPadReportPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set the answer' }));
    expect(screen.getByRole('heading', { name: 'Set the answer for Q.38' })).toBeTruthy();
    expect(screen.getByText('Is the latitude measured from the equator?', { selector: 'p' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, 2 answered' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/pad/prompts/p2/key',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ keys: ['yes'] }) }),
      ),
    );
    // Reloaded after the change, so the tables show the server's numbers.
    await waitFor(() => expect(mocks.fetch.mock.calls.filter(([path]) => path === '/api/pad/sessions/s1/report')).toHaveLength(2));
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });

  it('downloads the same rows as a CSV named after the class and its date', async () => {
    render(<AnswerPadReportPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }));

    expect(mocks.downloadCsv).toHaveBeenCalledWith('answer-pad-nata-evening-batch-2026-09-10.csv', REPORT_CSV_HEADERS, [
      ['Asha', 'Yes', 2, 0, 0, 1, 0, 0, 1, '100%', '', '', '', '', ''],
      ['Bala', 'Yes', 0, 0, 2, 0, 0, 0, 0, '', '', '', '', '', ''],
      ['Visitor', 'No', 1, 0, 1, 0, 1, 0, 1, '0%', '', '', '', '', ''],
    ]);
  });

  it('explains a refusal instead of showing an empty report', async () => {
    mocks.fetch.mockResolvedValue(answer(403, { error: 'NOT_SESSION_TEACHER', code: 'NOT_SESSION_TEACHER' }));
    render(<AnswerPadReportPage />);
    expect(await screen.findByText('Only the teacher who ran this class can see its report.')).toBeTruthy();
  });

  it('offers a refresh while the class is still running', async () => {
    mocks.fetch.mockResolvedValue(answer(200, report({ session: { ...report().session, status: 'live', ended_at: null } })));
    render(<AnswerPadReportPage />);

    expect(await screen.findByText('Class still running')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.fetch.mock.calls.filter(([path]) => path === '/api/pad/sessions/s1/report')).toHaveLength(2));
  });

  it('titles the page by its round and ranks the students by most correct, with their labels', async () => {
    routes({ '/api/pad/sessions/s1/results': () => answer(200, results()) });
    render(<AnswerPadReportPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Round 2' })).toBeTruthy();
    expect(screen.getByText('Answer Pad report')).toBeTruthy();
    expect(within(screen.getByText('Class average').parentElement as HTMLElement).getByText('61%')).toBeTruthy();
    expect(within(screen.getByText('Took part').parentElement as HTMLElement).getByText('2 of 3')).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'Rank 1: Asha, 15 of 16 correct' })).toBeTruthy();

    const ranked = screen.getByRole('table', { name: "Each student's result, ranked by most correct" });
    const rows = within(ranked).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Asha', 'Bala', 'Zara']);
    expect(within(rows[0]).getByText('Strong')).toBeTruthy();
    expect(within(rows[1]).getByText('Needs practice')).toBeTruthy();
    expect(within(rows[2]).getByText('Not active')).toBeTruthy();
    // Rank out of everyone who joined, then attempted, not attempted, right of attempted.
    expect(within(rows[1]).getAllByRole('cell').slice(0, 4).map((cell) => cell.textContent)).toEqual(['2 of 3', '14', '2', '4 of 14']);
    expect(document.body.textContent).not.toMatch(/[–—]|--/);
  });

  it('adds attempted and rank to the CSV once the round results have loaded', async () => {
    routes({ '/api/pad/sessions/s1/results': () => answer(200, results()) });
    render(<AnswerPadReportPage />);
    await screen.findByRole('table', { name: "Each student's result, ranked by most correct" });
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const rows = mocks.downloadCsv.mock.calls[0][2] as unknown[][];
    // The report fixture's Asha is student 'a': 16 attempted, 94% right, rank 1 of 3.
    expect(rows.find((row) => row[0] === 'Asha')?.slice(10)).toEqual([16, 0, '94%', 1, 3]);
  });

  it('will not publish while the round is running, and says why', async () => {
    routes({
      '/api/pad/sessions/s1/report': () => answer(200, report({ session: { ...report().session, status: 'live', ended_at: null } })),
      '/api/pad/sessions/s1/results': () => answer(200, results({ status: 'live', ended_at: null })),
    });
    render(<AnswerPadReportPage />);

    const publish = await screen.findByRole('button', { name: 'Publish results' });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('End the round in the meeting first')).toBeTruthy();
  });

  it('explains what students get, then publishes and shows when', async () => {
    let published: string | null = null;
    routes({
      '/api/pad/sessions/s1/results': () => answer(200, results({ results_published_at: published })),
      '/api/pad/sessions/s1/publish': () => {
        published = '2026-09-10T16:30:00Z';
        return answer(200, { publishedAt: published, notified: 2 });
      },
    });
    render(<AnswerPadReportPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Publish results' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish Round 2 results?' });
    expect(
      within(dialog).getByText(
        'Each student sees what they attempted, what they got right, their own rank, each question, the top 5 and the class average. Each student also gets a Teams chat from Neram Assistant with their own result (first publish only).',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith('/api/pad/sessions/s1/publish', expect.objectContaining({ method: 'POST', body: '{}' })),
    );
    expect(await screen.findByText('Results published. 2 students were sent their result in Teams.')).toBeTruthy();
    expect(await screen.findByText(/^Published /)).toBeTruthy();
    // The dialog hides the page from assistive tech until it has finished closing.
    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });

  it('withdraws published results', async () => {
    routes({
      '/api/pad/sessions/s1/results': () => answer(200, results({ results_published_at: '2026-09-10T16:30:00Z' })),
      '/api/pad/sessions/s1/publish': () => answer(200, { publishedAt: null, notified: 0 }),
    });
    render(<AnswerPadReportPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/pad/sessions/s1/publish',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ publish: false }) }),
      ),
    );
    expect(await screen.findByText('Results withdrawn. Students no longer see them.')).toBeTruthy();
  });

  it('says when results changed after publishing, and publishes again', async () => {
    routes({
      '/api/pad/sessions/s1/results': () => answer(200, results({ results_published_at: '2026-09-10T16:30:00Z', changed_since_publish: true })),
      '/api/pad/sessions/s1/publish': () => answer(200, { publishedAt: '2026-09-10T17:00:00Z', notified: 0 }),
    });
    render(<AnswerPadReportPage />);

    expect(await screen.findByText(/Results changed after you published/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish again' }));
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith('/api/pad/sessions/s1/publish', expect.objectContaining({ method: 'POST', body: '{}' })),
    );
  });

  it('explains a refused publish', async () => {
    routes({
      '/api/pad/sessions/s1/results': () => answer(200, results()),
      '/api/pad/sessions/s1/publish': () => answer(409, { error: 'INVALID_TRANSITION', code: 'INVALID_TRANSITION' }),
    });
    render(<AnswerPadReportPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Publish results' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('End the round in the meeting first, then publish.')).toBeTruthy();
  });
});

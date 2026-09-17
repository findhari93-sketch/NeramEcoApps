import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_CSV_HEADERS, type SessionReport } from '@/lib/pad/client/report';
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
        answer_type: 'mcq',
        option_count: 4,
        state: 'revealed',
        ungraded: false,
        correct_keys: ['B'],
        opened_at: '2026-09-10T15:05:00Z',
        closed_at: '2026-09-10T15:06:00Z',
        revealed_at: '2026-09-10T15:07:00Z',
        counts: COUNTS,
      },
      {
        id: 'p2',
        sequence: 2,
        label: null,
        answer_type: 'yesno',
        option_count: null,
        state: 'closed',
        ungraded: false,
        correct_keys: null,
        opened_at: '2026-09-10T15:10:00Z',
        closed_at: '2026-09-10T15:11:00Z',
        revealed_at: null,
        counts: COUNTS,
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

    expect(screen.getByText('1 question was never revealed, so it is not graded.')).toBeTruthy();
    // Class score counts the class list only: Asha 1 of 1, the visitor is left out.
    expect(within(screen.getByText('Class score').parentElement as HTMLElement).getByText('100%')).toBeTruthy();

    const questions = screen.getByRole('table', { name: 'Each question, its answer and how the class responded' });
    expect(within(questions).getByRole('rowheader', { name: 'Q1 Warm-up' })).toBeTruthy();
    expect(within(questions).getByText('Not revealed')).toBeTruthy();
    expect(within(questions).getAllByText('2 of 3')).toHaveLength(2);

    const students = screen.getByRole('table', { name: "Each student's participation and score" });
    const bala = within(students).getByRole('row', { name: /Bala/ });
    expect(within(bala).getByText('No score')).toBeTruthy();
    expect(within(students).getByText('Not on class list')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });

  it('downloads the same rows as a CSV named after the class and its date', async () => {
    render(<AnswerPadReportPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }));

    expect(mocks.downloadCsv).toHaveBeenCalledWith('answer-pad-nata-evening-batch-2026-09-10.csv', REPORT_CSV_HEADERS, [
      ['Asha', 'Yes', 2, 0, 0, 1, 0, 0, 1, '100%'],
      ['Bala', 'Yes', 0, 0, 2, 0, 0, 0, 0, ''],
      ['Visitor', 'No', 1, 0, 1, 0, 1, 0, 1, '0%'],
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
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  });
});

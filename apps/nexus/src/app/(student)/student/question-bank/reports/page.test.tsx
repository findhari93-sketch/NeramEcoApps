import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { QBStudentReportItem } from '@neram/database';

/**
 * A student's own reports: which question, what they said was wrong, and what
 * came of it, in the teacher's words when there are any.
 */

const auth = vi.hoisted(() => ({ getToken: async () => 't' }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const { default: Page } = await import('./page');

// A fresh SWR cache per test, or one test's reports show up in the next.
const StudentReportsPage = () => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <Page />
  </SWRConfig>
);

function report(over: Partial<QBStudentReportItem> = {}): QBStudentReportItem {
  return {
    id: 'r1',
    question_id: 'q31',
    student_id: 's1',
    report_type: 'wrong_working',
    description: 'Step 3 uses sin',
    status: 'open',
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: '2026-09-22T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z',
    target: 'video',
    part_label: null,
    solution_ref: null,
    video_seconds: null,
    source: 'practice',
    test_id: null,
    notified_at: null,
    question_text: 'Houses located on which slopes get more sun in winter?',
    paper_label: 'JEE Paper 2 2015',
    question_number: 31,
    ...over,
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function serve(rows: QBStudentReportItem[]) {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: rows }) });
}

describe('Student reports page', () => {
  it('names the question and what was reported, and says it is waiting', async () => {
    serve([report()]);
    render(<StudentReportsPage />);
    expect(await screen.findByText('JEE Paper 2 2015, Q31')).not.toBeNull();
    expect(screen.getByText('Video solution: Mistake in the working')).not.toBeNull();
    expect(screen.getByText('Waiting for a teacher')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Open the question/ }).getAttribute('href')).toBe(
      '/student/question-bank/questions/q31',
    );
  });

  it("gives the teacher's reason when it was not a mistake", async () => {
    serve([report({ status: 'dismissed', resolution_note: 'sin 30 is 0.5, so step 3 is right.' })]);
    render(<StudentReportsPage />);
    expect(await screen.findByText('Checked: not a mistake')).not.toBeNull();
    expect(screen.getByText('sin 30 is 0.5, so step 3 is right.')).not.toBeNull();
  });

  it('says fixed when it was fixed', async () => {
    serve([report({ status: 'resolved' })]);
    render(<StudentReportsPage />);
    expect(await screen.findByText('Fixed')).not.toBeNull();
  });

  it('explains where reports come from when there are none', async () => {
    serve([]);
    render(<StudentReportsPage />);
    expect(await screen.findByText('No reports yet')).not.toBeNull();
    expect(screen.getByText(/Report a mistake/)).not.toBeNull();
  });
});

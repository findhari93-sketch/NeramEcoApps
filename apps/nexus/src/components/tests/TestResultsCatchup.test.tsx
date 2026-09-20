import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import TestResultsPanel from './TestResultsPanel';

/**
 * The three things the 18 Aug exam could not answer on this screen.
 *
 * 1. Ten students sat under "Joined after this class" and the tab never said
 *    which of them still owed catch-up, so a teacher chased them one name at a
 *    time through the search box.
 * 2. Chetana was paused and still on the list, because she had sat the paper
 *    and the dormant filter kept anybody with an attempt.
 * 3. The Conducted card said "Results not published" and linked here, and here
 *    had no way to publish anything.
 */

vi.mock('@/components/students/StudentAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));
vi.mock('@/components/tests/StudentAttemptSheet', () => ({ default: () => null }));
vi.mock('@/components/tests/QuestionDoctorDialog', () => ({ default: () => null }));
vi.mock('@/components/tests/QuestionEditDialog', () => ({ default: () => null }));
vi.mock('@/components/tests/RegradePreviewDialog', () => ({ default: () => null }));
vi.mock('@/components/tests/CountAttemptSheet', () => ({ default: () => null }));
vi.mock('@/components/tests/TestMessageDialog', () => ({
  default: ({
    recipients,
    onClose,
  }: {
    recipients: Array<{ name: string | null; behind?: boolean }>;
    onClose: () => void;
  }) => (
    <div data-testid="composer">
      <span data-testid="composer-names">{recipients.map((r) => r.name).join(',')}</span>
      <span data-testid="composer-behind">
        {recipients.filter((r) => r.behind).map((r) => r.name).join(',')}
      </span>
      <button type="button" onClick={onClose}>
        pretend-cancel
      </button>
    </div>
  ),
}));
// Standing in for the real publish sheet, which fetches its own preview. All
// this needs to prove is that the button reaches it, for the right exam.
vi.mock('@/components/scheduled-exams/ExamResultsSheet', () => ({
  default: ({ open, examId }: { open: boolean; examId: string }) =>
    open ? <div data-testid="publish-sheet">{examId}</div> : null,
}));

const student = (over: Record<string, unknown> = {}) => ({
  student_id: 'stu-1',
  student_name: 'Asha Kumar',
  avatar_url: null,
  attempts: 0,
  first_percentage: null,
  first_score: null,
  first_total_marks: null,
  first_submitted_at: null,
  best_percentage: null,
  best_score: null,
  best_total_marks: null,
  last_percentage: null,
  last_submitted_at: null,
  passed: null,
  status: 'excused',
  bucket: 'excused_new_joiner',
  is_mandatory: false,
  provisional: false,
  window_open_until: null,
  access_request_pending: false,
  elsewhere: null,
  catchup: null,
  ...over,
});

const CLASSES = [
  { id: 'c1', title: 'Indian Architectural Heritage', date: '2026-08-12' },
  { id: 'c2', title: 'Indo-Aryan Temple Architecture', date: '2026-08-14' },
];

/** The five on production who joined later and still owe the covered classes. */
const behind = student({
  student_id: 'behind-1',
  student_name: 'Ananya AnoopPuthan',
  catchup: { state: 'behind', outstanding: CLASSES },
});
const behindOne = student({
  student_id: 'behind-2',
  student_name: 'Afrin banu',
  catchup: { state: 'behind', outstanding: [CLASSES[0]] },
});
/** Joined later, caught up, still never sat it. Not a chase, a decision. */
const caughtUp = student({
  student_id: 'caught-1',
  student_name: 'Iswarya Palaniappan',
  catchup: { state: 'caught_up', outstanding: [] },
});
/** No attendance row and no absence row. Saying "caught up" here would be a lie. */
const noRecord = student({
  student_id: 'unknown-1',
  student_name: 'Jeshurun Winsley',
  catchup: { state: 'unknown', outstanding: [] },
});
/** In the class, sat it, nothing to say about catch-up. */
const sat = student({
  student_id: 'sat-1',
  student_name: 'Anushka Anand',
  attempts: 1,
  status: 'submitted',
  passed: true,
  first_percentage: 90,
  first_score: 45,
  first_total_marks: 50,
  first_submitted_at: '2026-08-18T04:00:00Z',
  best_percentage: 90,
  bucket: 'mandatory_attended',
  is_mandatory: true,
  catchup: { state: 'attended', outstanding: [] },
});
/** Paused by staff, and she really sat it. */
const paused = student({
  student_id: 'paused-1',
  student_name: 'Chetana AjayKumar',
  attempts: 1,
  status: 'submitted',
  passed: false,
  first_percentage: 30,
  first_score: 15,
  first_total_marks: 50,
  first_submitted_at: '2026-08-18T04:00:00Z',
  best_percentage: 30,
  bucket: 'mandatory_attended',
  is_mandatory: true,
  paused: true,
  catchup: { state: 'attended', outstanding: [] },
});

const STATS = {
  students: 5,
  attempts: 1,
  average: 90,
  passed: 1,
  roster_total: 5,
  mandatory: 2,
  submitted: 1,
  not_started: 0,
  missed: 0,
  excused: 4,
  average_first: 90,
  average_first_marks: { score: 45, total: 50 },
  average_best_marks: { score: 45, total: 50 },
  pass_mark_pct: 80,
  paused_hidden: 0,
};

const RUNS = [
  {
    placement_id: 'run-1',
    door: 'exam',
    context_type: 'exam',
    label: 'Exam: 18 Aug',
    opens_at: null,
    closes_at: '2026-08-18T12:00:00Z',
    attempts: 1,
    is_active: true,
  },
];

const exam = (over: Record<string, unknown> = {}) => ({
  id: 'exam-1',
  title: 'History of Architecture Test',
  results_state: 'unpublished',
  results_published_at: null,
  closes_at: '2026-08-18T12:00:00Z',
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  rows: [sat, behind, behindOne, caughtUp, noRecord, paused],
  stats: STATS,
  questions: [],
  runs: RUNS,
  run: {
    placement_id: 'run-1',
    door: 'exam',
    context_type: 'exam',
    closes_at: null,
    passing_pct: 80,
    exam: exam(),
  },
  ...over,
});

function mount(data: Record<string, unknown>) {
  const authFetch = vi.fn(async () => ({ data }));
  render(
    <TestResultsPanel
      testId="test-1"
      authFetch={authFetch as never}
      getToken={async () => 'tok'}
      initialRunId="run-1"
    />,
  );
  return authFetch;
}

const tile = (key: string) => screen.getByTestId(`stat-tile-${key}`);

beforeEach(() => {
  window.history.replaceState({}, '', '/teacher/tests/test-1');
});

describe('catch-up on the student rows', () => {
  it('counts the classes a student still owes, and names them', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Ananya AnoopPuthan')).not.toBeNull());

    expect(screen.getAllByText('2 classes still to catch up')).toHaveLength(1);
    expect(screen.getByText('1 class still to catch up')).not.toBeNull();
    expect(
      screen.getByText('Indian Architectural Heritage (12 Aug), Indo-Aryan Temple Architecture (14 Aug)'),
    ).not.toBeNull();
  });

  it('never calls a student with no record caught up', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Jeshurun Winsley')).not.toBeNull());

    expect(screen.getByText('No record of these classes')).not.toBeNull();
    expect(screen.getAllByText(/Caught up on this test/)).toHaveLength(1);
  });

  it('says nothing about catch-up for somebody who sat it', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    // Their row carries a score line instead. Nothing on it mentions catch-up.
    const row = screen.getByText('Anushka Anand').closest('div')?.parentElement;
    expect(row?.textContent).not.toMatch(/catch up/i);
  });
});

describe('the Behind on catch-up tile', () => {
  it('counts only the students who owe something and have not sat it', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Ananya AnoopPuthan')).not.toBeNull());

    expect(within(tile('behind')).getByText('2')).not.toBeNull();
  });

  it('narrows to exactly the chase list', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Ananya AnoopPuthan')).not.toBeNull());

    fireEvent.click(tile('behind'));

    expect(screen.getByText('Ananya AnoopPuthan')).not.toBeNull();
    expect(screen.getByText('Afrin banu')).not.toBeNull();
    // Caught up, and never sat it. A message cannot fix what is stopping them.
    expect(screen.queryByText('Iswarya Palaniappan')).toBeNull();
    expect(screen.queryByText('Anushka Anand')).toBeNull();
  });

  it('is not offered when nobody is behind', async () => {
    mount(payload({ rows: [sat, caughtUp] }));
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    expect(screen.queryByTestId('stat-tile-behind')).toBeNull();
  });

  it('marks those recipients as behind, so the composer can offer the right words', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Ananya AnoopPuthan')).not.toBeNull());

    fireEvent.click(tile('behind'));
    fireEvent.click(screen.getByLabelText('Select all 2 shown'));
    fireEvent.click(screen.getByText('Message (2)'));

    await waitFor(() => expect(screen.getByTestId('composer')).not.toBeNull());
    expect(screen.getByTestId('composer-behind').textContent).toContain('Ananya AnoopPuthan');
    expect(screen.getByTestId('composer-behind').textContent).toContain('Afrin banu');
  });
});

describe('paused students', () => {
  it('leaves a paused student off the list even though she sat it', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    expect(screen.queryByText('Chetana AjayKumar')).toBeNull();
    expect(screen.getByTestId('paused-footnote').textContent).toContain('1 paused student is not shown');
  });

  it('brings her back, with her score, on one tap', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));

    expect(screen.getByText('Chetana AjayKumar')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Hide them' })).not.toBeNull();
  });

  it('keeps her out of every count either way', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    const before = within(tile('all')).getByText('5').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(within(tile('all')).getByText('5').textContent).toBe(before);
  });

  it('offers no toggle when there is nothing to reveal', async () => {
    mount(payload({ rows: [sat, behind] }));
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    expect(screen.queryByRole('button', { name: 'Show them' })).toBeNull();
  });
});

describe('publishing the results', () => {
  it('says results are held back, and what publishing would do', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByTestId('exam-results-state')).not.toBeNull());

    expect(screen.getByText('Results not published')).not.toBeNull();
    expect(screen.getByText(/Nobody can see their score, their rank or their answers yet/)).not.toBeNull();
    // The question the founder actually asked: what happens to the late sitters.
    expect(screen.getByText(/second sitting list/)).not.toBeNull();
  });

  it('opens the publish sheet for this exam', async () => {
    mount(payload());
    await waitFor(() => expect(screen.getByTestId('exam-results-state')).not.toBeNull());

    expect(screen.queryByTestId('publish-sheet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish results' }));
    expect(screen.getByTestId('publish-sheet').textContent).toBe('exam-1');
  });

  it('reads differently once results are out', async () => {
    mount(
      payload({
        run: {
          placement_id: 'run-1',
          door: 'exam',
          context_type: 'exam',
          closes_at: null,
          passing_pct: 80,
          exam: exam({ results_state: 'provisional', results_published_at: '2026-09-01T00:00:00Z' }),
        },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('exam-results-state')).not.toBeNull());

    expect(screen.getByText('Results are out, marked provisional')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Review results' })).not.toBeNull();
  });

  it('says nothing at all on a run that is not an exam', async () => {
    mount(
      payload({
        run: {
          placement_id: 'run-1',
          door: 'practice',
          context_type: 'student_practice',
          closes_at: null,
          passing_pct: null,
          exam: null,
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('Anushka Anand')).not.toBeNull());

    expect(screen.queryByTestId('exam-results-state')).toBeNull();
  });
});

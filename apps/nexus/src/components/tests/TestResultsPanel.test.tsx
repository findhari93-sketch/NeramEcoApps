import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import TestResultsPanel from './TestResultsPanel';

/**
 * The results, as a teacher reads them.
 *
 * Written from a founder's report on the live page: a student row showed a bare
 * "100%" and a "7 attempts" count. Neither said how many questions that was,
 * out of what, nor what the student knew the first time they sat it, and there
 * was no way at all to see the students who never sat it. Every test here is
 * one of those complaints.
 */

// Renders no text: the real one shows initials, and a second copy of the name
// in the DOM would make every getByText here ambiguous.
vi.mock('@/components/students/StudentAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));

// The drawer fetches on its own and is covered by its own tests; here it only
// needs to not explode when the panel mounts it closed.
vi.mock('@/components/tests/StudentAttemptSheet', () => ({ default: () => null }));

const row = (over: Record<string, unknown> = {}) => ({
  student_id: 'stu-1',
  student_name: 'Inaya Nizamudeen',
  avatar_url: null,
  attempts: 7,
  first_percentage: 62,
  first_score: 28,
  first_total_marks: 45,
  first_submitted_at: '2026-08-11T04:00:00Z',
  best_percentage: 100,
  best_score: 45,
  best_total_marks: 45,
  last_percentage: 100,
  last_submitted_at: '2026-08-18T04:00:00Z',
  passed: true,
  status: 'submitted',
  bucket: 'mandatory_attended',
  is_mandatory: true,
  provisional: false,
  window_open_until: null,
  access_request_pending: false,
  elsewhere: null,
  ...over,
});

const notStarted = (over: Record<string, unknown> = {}) =>
  row({
    student_id: 'stu-2',
    student_name: 'Meera S',
    attempts: 0,
    first_percentage: null,
    first_score: null,
    first_total_marks: null,
    best_percentage: null,
    best_score: null,
    best_total_marks: null,
    last_submitted_at: null,
    passed: null,
    status: 'not_started',
    bucket: 'mandatory_caught_up',
    ...over,
  });

const RUN_STATS = {
  students: 1,
  attempts: 7,
  average: 100,
  passed: 1,
  roster_total: 3,
  mandatory: 2,
  submitted: 1,
  not_started: 1,
  missed: 0,
  excused: 1,
  average_first: 62,
  average_first_marks: { score: 28, total: 45 },
  average_best_marks: { score: 45, total: 45 },
  pass_mark_pct: 60,
};

function mountWith(payload: Record<string, unknown>) {
  const authFetch = vi.fn(async () => ({ data: payload }));
  render(<TestResultsPanel testId="test-1" authFetch={authFetch as never} getToken={async () => 'tok'} />);
  return authFetch;
}

describe('TestResultsPanel', () => {
  /** The complaint, verbatim: "it just shows 100% I don't know what this is". */
  it('never shows a student a percentage without the marks it came from', async () => {
    mountWith({ rows: [row()], stats: RUN_STATS, questions: [], runs: [], run: null });

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    // Both the score chip and the summary line carry marks.
    expect(screen.getAllByText(/100% \(45\/45\)/).length).toBeGreaterThan(0);

    // Nothing in the student list is a bare percentage.
    const list = screen.getByText('Inaya Nizamudeen').closest('.MuiPaper-root')!;
    const bare = Array.from(list.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && /^\d+%$/.test((el.textContent || '').trim()),
    );
    expect(bare).toHaveLength(0);
  });

  it('explains the cohort average with the marks behind it', async () => {
    mountWith({ rows: [row()], stats: RUN_STATS, questions: [], runs: [], run: null });

    await waitFor(() =>
      expect(screen.getByText('Average 100% (45 of 45 marks), best attempt each · pass mark 60%')).not.toBeNull(),
    );
  });

  it('shows the first sitting beside the best one, both with raw marks', async () => {
    mountWith({ rows: [row()], stats: RUN_STATS, questions: [], runs: [], run: null });

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    const line = screen.getByText(/7 attempts/);
    expect(line.textContent).toContain('62% (28/45)');
    expect(line.textContent).toContain('100% (45/45)');
  });

  /**
   * The half of the report that never existed. A teacher could not tell a
   * finished class from a class that ignored the paper.
   */
  it('lists the students who never sat it, under a heading saying why they were expected to', async () => {
    mountWith({ rows: [row(), notStarted()], stats: RUN_STATS, questions: [], runs: [], run: null });

    await waitFor(() => expect(screen.getByText('Meera S')).not.toBeNull());
    expect(screen.getAllByText(/Not started/).length).toBeGreaterThan(0);
    expect(screen.getByText(/IN THE CLASS/)).not.toBeNull();
    expect(screen.getByText(/CAUGHT UP LATER/)).not.toBeNull();
  });

  it('counts who is done against everybody the run was set for', async () => {
    mountWith({ rows: [row(), notStarted()], stats: RUN_STATS, questions: [], runs: [], run: null });

    await waitFor(() => expect(screen.getByTestId('stat-tile-did')).not.toBeNull());
    const done = screen.getByTestId('stat-tile-did');
    expect(within(done).getByText('Done')).not.toBeNull();
    expect(within(done).getByText('1')).not.toBeNull();
    expect(within(done).getByText('of 2')).not.toBeNull();
    expect(within(screen.getByTestId('stat-tile-not_done')).getByText('1 not started, 0 missed')).not.toBeNull();
  });

  /**
   * A run with a roster is never empty, even before anyone sits it: the list of
   * people who have not is exactly what the teacher came for.
   */
  it('does not show the empty state for a run nobody has sat yet', async () => {
    mountWith({
      rows: [row({ attempts: 0, status: 'not_started', best_percentage: null, first_percentage: null })],
      stats: { ...RUN_STATS, attempts: 0, students: 0, submitted: 0, not_started: 1 },
      questions: [],
      runs: [],
      run: null,
    });

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    expect(screen.queryByText(/Nobody has sat this test yet/)).toBeNull();
  });

  it('still shows the empty state for a paper nobody anywhere has sat', async () => {
    mountWith({
      rows: [],
      stats: { ...RUN_STATS, attempts: 0, students: 0, roster_total: null, mandatory: null, submitted: null },
      questions: [],
      runs: [],
      run: null,
    });

    await waitFor(() => expect(screen.getByText(/Nobody has sat this test yet/)).not.toBeNull());
  });

  /** The paper-wide view has no roster, so no "done" or "not done" to show. */
  it('keeps to the groups that mean something when no run is selected', async () => {
    mountWith({
      rows: [row()],
      stats: {
        students: 21,
        attempts: 31,
        average: 80,
        passed: 20,
        roster_total: null,
        mandatory: null,
        submitted: null,
        not_started: null,
        missed: null,
        excused: null,
        average_first: null,
        average_first_marks: null,
        average_best_marks: null,
        pass_mark_pct: null,
      },
      questions: [],
      runs: [],
      run: null,
    });

    await waitFor(() => expect(screen.getByTestId('stat-tile-all')).not.toBeNull());
    expect(within(screen.getByTestId('stat-tile-all')).getByText('31 attempts, retakes included')).not.toBeNull();
    expect(screen.getByTestId('stat-tile-passed')).not.toBeNull();
    expect(screen.queryByTestId('stat-tile-did')).toBeNull();
    expect(screen.queryByTestId('stat-tile-not_done')).toBeNull();
  });

  it('offers the runs of this paper so a class test can be read apart from practice', async () => {
    mountWith({
      rows: [row()],
      stats: RUN_STATS,
      questions: [],
      runs: [
        { placement_id: 'p-1', door: 'class', context_type: 'class_test', label: 'Class test: Islamic Architecture, 24 Aug', opens_at: null, closes_at: null, attempts: 24, is_active: true },
        { placement_id: 'p-2', door: 'practice', context_type: 'student_practice', label: 'Practice (always open)', opens_at: null, closes_at: null, attempts: 7, is_active: true },
      ],
      run: null,
    });

    await waitFor(() => expect(screen.getByText(/Class test: Islamic Architecture, 24 Aug/)).not.toBeNull());
    expect(screen.getByText(/Practice \(always open\)/)).not.toBeNull();
    expect(screen.getByText(/Everyone, all time/)).not.toBeNull();
  });

  it('says a student was let back in rather than calling them missing', async () => {
    mountWith({
      rows: [
        row({
          attempts: 0,
          status: 'not_started',
          best_percentage: null,
          first_percentage: null,
          window_open_until: '2026-08-25T04:00:00Z',
          access_request_pending: true,
        }),
      ],
      stats: RUN_STATS,
      questions: [],
      runs: [],
      run: null,
    });

    await waitFor(() => expect(screen.getByText(/open until/)).not.toBeNull());
    // Twice over, and both matter: a banner at the top so the teacher sees the
    // ask without scrolling, and the row itself so they know whose it is.
    expect(screen.getByText(/asked to reopen this test/)).not.toBeNull();
    expect(screen.getByText(/· asked to reopen$/)).not.toBeNull();
  });

  /** Mounted on its own, as the paper workspace does, it brings its own switch. */
  it('offers its own Students and Questions switch when no page controls it', async () => {
    mountWith({
      rows: [row()],
      stats: RUN_STATS,
      questions: [
        {
          question_id: 'q1',
          question_text: 'Which dynasty built the Lingaraja temple?',
          sort_order: 0,
          answered: 4,
          correct: 3,
          correct_pct: 75,
          top_wrong_option: null,
          option_counts: null,
          needs_review: false,
          ai: null,
        },
      ],
      runs: [],
      run: null,
    });

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Questions' }));
    await waitFor(() => expect(screen.getByTestId('question-row-1')).not.toBeNull());
    expect(screen.queryByText('Inaya Nizamudeen')).toBeNull();
  });

  it('shows no switch of its own when the page chooses the tab', async () => {
    const authFetch = vi.fn(async () => ({
      data: { rows: [row()], stats: RUN_STATS, questions: [], runs: [], run: null },
    }));
    render(
      <TestResultsPanel
        testId="test-1"
        authFetch={authFetch as never}
        getToken={async () => 'tok'}
        view="students"
        runId=""
        onRunIdChange={() => {}}
        pool={[]}
      />,
    );

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Questions' })).toBeNull();
  });
});

/**
 * Stage 7. Everything below came from one screenshot of the live 18 Aug run:
 * four students reading only "Missed the date", and the one who had sat it and
 * scored 0% having no way to be given another go.
 */
describe('TestResultsPanel, self-study evidence and reopening', () => {
  const RUN = { placement_id: 'run-1', door: 'exam', context_type: 'exam', closes_at: null, passing_pct: 80 };

  function mountRun(rows: Record<string, unknown>[]) {
    const authFetch = vi.fn(async () => ({
      data: {
        rows,
        stats: RUN_STATS,
        questions: [],
        runs: [{ placement_id: 'run-1', door: 'exam', context_type: 'exam', label: 'Exam: 18 Aug', opens_at: null, closes_at: null, attempts: 16, is_active: true }],
        run: RUN,
      },
    }));
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

  const missed = (over: Record<string, unknown> = {}) =>
    row({
      student_id: 'stu-missed',
      student_name: 'Inaya Nizamudeen',
      attempts: 0,
      status: 'missed',
      first_percentage: null,
      first_score: null,
      first_total_marks: null,
      best_percentage: null,
      best_score: null,
      best_total_marks: null,
      last_percentage: null,
      last_submitted_at: null,
      passed: null,
      ...over,
    });

  /**
   * The founder's question. She is the top scorer on this paper and the run
   * reported only that she missed it, which is the line a teacher acts on.
   */
  it('says a student did the paper on their own beside "Missed the date"', async () => {
    mountRun([missed({ elsewhere: { attempts: 7, best_percentage: 100, last_at: '2026-08-19T04:00:00Z' } })]);

    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    expect(screen.getByText('Did this paper 7 times on their own, best 100%')).not.toBeNull();
  });

  /** Self-study is not the class test, so it must not quietly become one. */
  it('still reports them as having missed the run', async () => {
    mountRun([missed({ elsewhere: { attempts: 7, best_percentage: 100, last_at: null } })]);
    await waitFor(() => expect(screen.getAllByText('Missed the date').length).toBeGreaterThan(0));
  });

  it('says nothing when a student has no attempts anywhere else', async () => {
    mountRun([missed()]);
    await waitFor(() => expect(screen.getByText('Inaya Nizamudeen')).not.toBeNull());
    expect(screen.queryByText(/on their own/)).toBeNull();
  });

  it('handles a single self-study attempt without a plural', async () => {
    mountRun([missed({ elsewhere: { attempts: 1, best_percentage: null, last_at: null } })]);
    await waitFor(() => expect(screen.getByText('Did this paper 1 time on their own')).not.toBeNull());
  });

  /**
   * Chetana's row. She sat the exam and scored 0% because something went wrong
   * mid-test, and the control was gated on `!sat`, so the student who most
   * obviously needed another sitting was the one the screen could not offer it
   * to.
   */
  it('offers another sitting to a student who already attempted', async () => {
    mountRun([row({ student_id: 'stu-sat', student_name: 'Chetana AjayKumar', attempts: 1, best_percentage: 0, best_score: 0, first_percentage: 0, first_score: 0, passed: false })]);

    await waitFor(() => expect(screen.getByText('Chetana AjayKumar')).not.toBeNull());
    expect(screen.getByText('Open again')).not.toBeNull();
  });

  it('still says "Open for them" for a student who never sat it', async () => {
    mountRun([missed()]);
    await waitFor(() => expect(screen.getByText('Open for them')).not.toBeNull());
  });

  it('offers to close a window that is already open', async () => {
    mountRun([missed({ window_open_until: '2026-09-02T00:00:00Z' })]);
    await waitFor(() => expect(screen.getByText('Close')).not.toBeNull());
  });

  /** A pending ask is a decision to make, not a door to open. */
  it('replaces the open control with approve and decline when a student has asked', async () => {
    mountRun([missed({ access_request_pending: true })]);
    await waitFor(() => expect(screen.getByText('Approve')).not.toBeNull());
    expect(screen.getByText('Decline')).not.toBeNull();
    expect(screen.queryByText('Open for them')).toBeNull();
  });

  it('names the student in the control label, for a screen reader on a long roster', async () => {
    mountRun([missed()]);
    await waitFor(() =>
      expect(screen.getByLabelText('Open this test for Inaya Nizamudeen')).not.toBeNull(),
    );
  });
});

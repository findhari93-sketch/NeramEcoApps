import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TestResultsPanel from './TestResultsPanel';

/**
 * The results tab as a place to ACT, not only to read.
 *
 * The complaint these came from: the screen could say "26 missed the date" and
 * "11 of 16 passed" and offered no way to select either group, reopen the test
 * for them, or tell them anything. And it could say a question was answered
 * correctly by nobody without offering any way to fix that question.
 */

vi.mock('@/components/students/StudentAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));
vi.mock('@/components/tests/StudentAttemptSheet', () => ({ default: () => null }));
// The dialogs fetch on open and are covered by the pure modules behind them.
// Here they only need to report that they were asked to open, and for whom.
vi.mock('@/components/tests/QuestionDoctorDialog', () => ({
  default: ({
    open,
    questionIds,
    onApplied,
  }: {
    open: boolean;
    questionIds: string[];
    onApplied: (r: { applied: number; answerKeyChanged: number; staleAttempts: number }) => void;
  }) =>
    open ? (
      <div data-testid="doctor">
        <span data-testid="doctor-ids">{questionIds.join(',')}</span>
        {/* Stands in for the teacher ticking a corrected answer and applying it. */}
        <button
          type="button"
          onClick={() => onApplied({ applied: 1, answerKeyChanged: 1, staleAttempts: 16 })}
        >
          pretend-apply-key-fix
        </button>
        <button
          type="button"
          onClick={() => onApplied({ applied: 1, answerKeyChanged: 0, staleAttempts: 0 })}
        >
          pretend-apply-wording-fix
        </button>
      </div>
    ) : null,
}));
vi.mock('@/components/tests/QuestionEditDialog', () => ({
  default: ({ open, questionId }: { open: boolean; questionId: string | null }) =>
    open ? <div data-testid="editor">{questionId}</div> : null,
}));
vi.mock('@/components/tests/RegradePreviewDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="regrade" /> : null),
}));
vi.mock('@/components/tests/TestMessageDialog', () => ({
  default: ({ recipients }: { recipients: Array<{ name: string | null }> }) => (
    <div data-testid="composer">{recipients.map((r) => r.name).join(',')}</div>
  ),
}));

const student = (over: Record<string, unknown> = {}) => ({
  student_id: 'stu-1',
  student_name: 'Asha Kumar',
  avatar_url: null,
  attempts: 1,
  first_percentage: 90,
  first_score: 45,
  first_total_marks: 50,
  first_submitted_at: '2026-08-18T04:00:00Z',
  best_percentage: 90,
  best_score: 45,
  best_total_marks: 50,
  last_percentage: 90,
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

/** Three shapes the teacher wants to act on separately. */
const passed = student({ student_id: 'p1', student_name: 'Asha Kumar', passed: true });
const failed = student({
  student_id: 'f1',
  student_name: 'Bala Raj',
  passed: false,
  first_percentage: 40,
  best_percentage: 40,
});
const missed = student({
  student_id: 'm1',
  student_name: 'Chetana Rao',
  attempts: 0,
  status: 'missed',
  passed: null,
  first_percentage: null,
  best_percentage: null,
  first_submitted_at: null,
  last_submitted_at: null,
});

const RUN_STATS = {
  students: 2,
  attempts: 2,
  average: 65,
  passed: 1,
  roster_total: 3,
  mandatory: 3,
  submitted: 2,
  not_started: 0,
  missed: 1,
  excused: 0,
  average_first: 65,
  average_first_marks: { score: 32, total: 50 },
  average_best_marks: { score: 32, total: 50 },
  pass_mark_pct: 80,
};

const RUNS = [
  {
    placement_id: 'run-1',
    door: 'exam',
    context_type: 'exam',
    label: 'Exam: Indus Valley, 18 Aug',
    opens_at: null,
    closes_at: '2026-08-18T12:00:00Z',
    attempts: 2,
    is_active: true,
  },
];

const indusQuestion = {
  question_id: 'q-indus',
  question_text: 'The Indus Valley Civilization is also known as which of the following?',
  sort_order: 2,
  answered: 9,
  correct: 0,
  correct_pct: 0,
  top_wrong_option: { key: 'a', text: 'Copper Age civilization', count: 9 },
  needs_review: true,
};

const goodQuestion = {
  question_id: 'q-good',
  question_text: 'The city of Mohenjo-Daro is located in which region?',
  sort_order: 4,
  answered: 5,
  correct: 4,
  correct_pct: 80,
  top_wrong_option: null,
  needs_review: false,
};

function mount(payload: Record<string, unknown>, fetchImpl?: any) {
  const authFetch = fetchImpl || vi.fn(async () => ({ data: payload }));
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

const runPayload = (over: Record<string, unknown> = {}) => ({
  rows: [passed, failed, missed],
  stats: RUN_STATS,
  questions: [indusQuestion, goodQuestion],
  runs: RUNS,
  run: { placement_id: 'run-1', door: 'exam', context_type: 'exam', closes_at: null, passing_pct: 80 },
  ...over,
});

beforeEach(() => {
  window.history.replaceState({}, '', '/teacher/tests/test-1');
});

describe('Students tab: filtering to a group', () => {
  it('offers a chip per group, each carrying its own count', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    expect(screen.getByText('Everyone 3')).not.toBeNull();
    expect(screen.getByText('Did it 2')).not.toBeNull();
    expect(screen.getByText('Not done 1')).not.toBeNull();
    expect(screen.getByText('Below pass 1')).not.toBeNull();
    expect(screen.getByText('Passed 1')).not.toBeNull();
  });

  it('narrows the list to the students who did not pass', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Below pass 1'));

    expect(screen.getByText('Bala Raj')).not.toBeNull();
    expect(screen.queryByText('Asha Kumar')).toBeNull();
    // The one who never sat it is NOT swept in here. They have no score to be
    // below anything, and they belong under Not done.
    expect(screen.queryByText('Chetana Rao')).toBeNull();
  });

  it('narrows the list to the students who never sat it', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Not done 1'));

    expect(screen.getByText('Chetana Rao')).not.toBeNull();
    expect(screen.queryByText('Bala Raj')).toBeNull();
  });

  it('writes the active group into the URL, so the view is shareable', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Below pass 1'));
    await waitFor(() => expect(window.location.search).toContain('filter=below_pass'));

    fireEvent.click(screen.getByText('Everyone 3'));
    await waitFor(() => expect(window.location.search).not.toContain('filter='));
  });

  it('opens straight onto a group named in the URL', async () => {
    const authFetch = vi.fn(async () => ({ data: runPayload() }));
    render(
      <TestResultsPanel
        testId="test-1"
        authFetch={authFetch as never}
        getToken={async () => 'tok'}
        initialRunId="run-1"
        initialFilter="not_done"
      />,
    );
    await waitFor(() => expect(screen.getByText('Chetana Rao')).not.toBeNull());
    expect(screen.queryByText('Asha Kumar')).toBeNull();
  });

  it('says why a group is empty instead of showing a blank panel', async () => {
    mount(runPayload({ rows: [passed], stats: { ...RUN_STATS, missed: 0 } }));
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    // With nobody outstanding the chip is not offered at all, which is the
    // stronger form of an empty state.
    expect(screen.queryByText(/^Not done/)).toBeNull();
  });
});

describe('Students tab: acting on a group', () => {
  it('offers no group actions until the teacher enters selection mode', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    expect(screen.queryByText(/^Reopen \(/)).toBeNull();
    expect(screen.queryByText(/^Message \(/)).toBeNull();
  });

  it('selects a whole filtered group in one press, then offers both actions', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Not done 1'));
    fireEvent.click(screen.getByText('Select students'));
    fireEvent.click(screen.getByText('Select all 1 shown'));

    expect(screen.getByText('1 selected')).not.toBeNull();
    expect(screen.getByText('Reopen (1)')).not.toBeNull();
    expect(screen.getByText('Message (1)')).not.toBeNull();
  });

  it('reopens the run for everyone selected, in one call', async () => {
    const authFetch = vi.fn(async (url: string) => {
      if (url.includes('/access/bulk')) {
        return { data: { results: [], counts: { requested: 1, ok: 1, failed: 0, off_roster: 0 } } };
      }
      return { data: runPayload() };
    });
    mount(runPayload(), authFetch);
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Not done 1'));
    fireEvent.click(screen.getByText('Select students'));
    fireEvent.click(screen.getByText('Select all 1 shown'));
    fireEvent.click(screen.getByText('Reopen (1)'));

    await waitFor(() => {
      const call = authFetch.mock.calls.find((c: any[]) => String(c[0]).includes('/access/bulk'));
      expect(call).toBeTruthy();
      expect(JSON.parse((call as any[])[1].body)).toEqual({
        student_ids: ['m1'],
        action: 'open',
      });
    });
  });

  it('reports a partial reopen honestly rather than as a success', async () => {
    const authFetch = vi.fn(async (url: string) => {
      if (url.includes('/access/bulk')) {
        return { data: { results: [], counts: { requested: 1, ok: 0, failed: 1, off_roster: 0 } } };
      }
      return { data: runPayload() };
    });
    mount(runPayload(), authFetch);
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Not done 1'));
    fireEvent.click(screen.getByText('Select students'));
    fireEvent.click(screen.getByText('Select all 1 shown'));
    fireEvent.click(screen.getByText('Reopen (1)'));

    await waitFor(() => expect(screen.getByText(/could not be opened/)).not.toBeNull());
  });

  it('hands the composer exactly the students that were selected', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());

    fireEvent.click(screen.getByText('Below pass 1'));
    fireEvent.click(screen.getByText('Select students'));
    fireEvent.click(screen.getByText('Select all 1 shown'));
    fireEvent.click(screen.getByText('Message (1)'));

    await waitFor(() => expect(screen.getByTestId('composer').textContent).toBe('Bala Raj'));
  });
});

describe('Question analysis: acting on a bad question', () => {
  it('offers one press to select every question that needs a look', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    fireEvent.click(screen.getByText('Select the 1 that need a look'));
    expect(screen.getByText('1 selected')).not.toBeNull();
    // The question that is doing its job is not swept in.
    expect(screen.getByText('Check 1 with AI')).not.toBeNull();
  });

  it('sends only the flagged question to the doctor', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    fireEvent.click(screen.getByText('Select the 1 that need a look'));
    fireEvent.click(screen.getByText('Check 1 with AI'));

    await waitFor(() => expect(screen.getByTestId('doctor-ids').textContent).toBe('q-indus'));
  });

  it('opens the doctor for a single question from its own menu', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    fireEvent.click(screen.getByLabelText('Actions for question 2'));
    fireEvent.click(screen.getByText('Check with AI'));

    await waitFor(() => expect(screen.getByTestId('doctor-ids').textContent).toBe('q-good'));
  });

  it('opens the plain editor for a single question', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    fireEvent.click(screen.getByLabelText('Actions for question 1'));
    fireEvent.click(screen.getByText('Edit question'));

    await waitFor(() => expect(screen.getByTestId('editor').textContent).toBe('q-indus'));
  });

  it('still says which question is worth checking, and why', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    expect(screen.getByText(/0 of 9 got it right/)).not.toBeNull();
    expect(screen.getByText(/most picked "Copper Age civilization" \(9\)/)).not.toBeNull();
    expect(
      screen.getByText('Check this question. At this rate it is more likely unclear than hard.'),
    ).not.toBeNull();
  });

  it('does not offer a group action before anything is selected', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));

    fireEvent.click(screen.getByText('Select questions'));
    expect(screen.queryByText(/^Check \d+ with AI/)).toBeNull();
  });
});

describe('The chain from a fixed question to a re-grade', () => {
  async function fixAQuestion(label: string) {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    fireEvent.click(screen.getByText('Question analysis'));
    fireEvent.click(screen.getByText('Select the 1 that need a look'));
    fireEvent.click(screen.getByText('Check 1 with AI'));
    await waitFor(() => expect(screen.getByTestId('doctor')).not.toBeNull());
    fireEvent.click(screen.getByText(label));
  }

  it('does not mention re-grading until an answer key actually changes', async () => {
    mount(runPayload());
    await waitFor(() => expect(screen.getByText('Asha Kumar')).not.toBeNull());
    expect(screen.queryByText(/marked on the/)).toBeNull();
  });

  it('offers the re-grade once a key has moved under recorded attempts', async () => {
    await fixAQuestion('pretend-apply-key-fix');

    await waitFor(() =>
      expect(
        screen.getByText(/1 question changed answer\. 16 attempts were marked on the old one\./),
      ).not.toBeNull(),
    );
    expect(screen.getByText('Re-grade')).not.toBeNull();
  });

  it('stays quiet after a wording fix, which cannot move a recorded score', async () => {
    // The trap this pins: offering a re-grade after every edit trains the
    // teacher to press through a dialog that usually does nothing, and then
    // they press through the one that does.
    await fixAQuestion('pretend-apply-wording-fix');

    await waitFor(() => expect(screen.getByText(/Applied 1 question fix/)).not.toBeNull());
    expect(screen.queryByText(/marked on the old one/)).toBeNull();
    expect(screen.queryByText('Re-grade')).toBeNull();
  });

  it('opens the re-grade preview from the banner', async () => {
    await fixAQuestion('pretend-apply-key-fix');
    await waitFor(() => expect(screen.getByText('Re-grade')).not.toBeNull());

    fireEvent.click(screen.getByText('Re-grade'));
    await waitFor(() => expect(screen.getByTestId('regrade')).not.toBeNull());
  });
});

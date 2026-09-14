import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudentTestCard, { examResultChip, type StudentTest } from './StudentTestCard';
import { resolveStudentTestCard, type StudentTestFacts } from '@/lib/student-test-card-state';

/**
 * What the card renders, and the one thing it must never render.
 *
 * The status wording itself is pinned in student-test-card-state.test.ts; these
 * tests hold the contract BETWEEN the resolver and the DOM: the sentence reaches
 * the screen verbatim, the button does what the sentence promised, and no state
 * ever produces a disabled control.
 *
 * Plain DOM assertions throughout. jest-dom matchers pass vitest here and then
 * fail the Nexus tsc build.
 */

const NOW = Date.parse('2026-09-12T12:00:00Z');
const DAY = 86_400_000;

const base: StudentTest = {
  id: 't1',
  title: 'History of Architecture Test',
  description: null,
  folder_label: null,
  question_count: 150,
  test_type: 'untimed',
  test_kind: 'chapter',
  duration_minutes: null,
  placement_id: 'p-exam',
  passing_pct: 80,
  available_from: null,
  available_until: null,
  attempt_limit: null,
  attempts: 0,
  best_percentage: null,
  last_submitted_at: null,
};

/** Builds the card exactly as the server would, so the two cannot drift. */
function make(over: Partial<StudentTest> & StudentTestFacts = {}): StudentTest {
  const test = { ...base, ...over } as StudentTest;
  return { ...test, card: resolveStudentTestCard(test as StudentTestFacts, NOW) };
}

function renderCard(over: Partial<StudentTest> & StudentTestFacts = {}, props: Record<string, unknown> = {}) {
  const test = make(over);
  const onStart = vi.fn();
  render(
    <StudentTestCard
      test={test}
      onStart={onStart}
      onAskTeacher={vi.fn()}
      onCatchUp={vi.fn()}
      onReschedule={vi.fn()}
      {...props}
    />,
  );
  return { test, onStart };
}

const cta = () => screen.queryByTestId('test-card-cta');

describe('StudentTestCard', () => {
  it('shows the resolver sentence verbatim, so the client re-derives nothing', () => {
    const { test } = renderCard({ available_until: new Date(NOW + 2 * DAY).toISOString() });
    expect(screen.queryByText(test.card!.reason)).not.toBeNull();
  });

  /** NXS-0125, at the DOM. */
  it('offers an enabled Start to a student their teacher reopened it for', () => {
    renderCard({
      is_exam: true,
      is_reopen: true,
      access_state: 'granted',
      available_from: new Date(NOW - DAY).toISOString(),
      available_until: new Date(NOW + 6 * DAY).toISOString(),
    });

    const button = cta();
    expect(button).not.toBeNull();
    expect(button!.textContent).toBe('Start the test');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  /**
   * The rule the redesign exists for. A greyed button carrying a refusal states
   * a problem and offers no way out of it.
   */
  it('never renders a disabled button, in any state', () => {
    const states: Array<Partial<StudentTest> & StudentTestFacts> = [
      {},
      { available_from: new Date(NOW + DAY).toISOString() },
      { available_until: new Date(NOW - DAY).toISOString() },
      { is_exam: true, available_until: new Date(NOW - DAY).toISOString() },
      { is_exam: true, available_until: new Date(NOW - DAY).toISOString(), access_state: 'pending' },
      { attempts: 2, attempt_limit: 2, best_percentage: 80, last_submitted_at: new Date(NOW - DAY).toISOString() },
      { catchup_gate: { blocked: true, outstanding: [{ id: 'c1', title: 'Islamic Architecture', date: '2026-08-14' }] } },
    ];

    for (const s of states) {
      const { unmount } = render(
        <StudentTestCard
          test={make(s)}
          onStart={vi.fn()}
          onAskTeacher={vi.fn()}
          onCatchUp={vi.fn()}
          onReschedule={vi.fn()}
        />,
      );
      const button = screen.queryByTestId('test-card-cta');
      if (button) expect((button as HTMLButtonElement).disabled, JSON.stringify(s)).toBe(false);
      unmount();
    }
  });

  it('renders no button at all when there is genuinely nothing to press', () => {
    renderCard({ available_from: new Date(NOW + DAY).toISOString() });
    expect(cta()).toBeNull();
    // and still says why
    expect(screen.queryByText(/^Opens /)).not.toBeNull();
  });

  it('sends a locked student to their catch-up rather than at a shut door', () => {
    const onCatchUp = vi.fn();
    renderCard(
      { catchup_gate: { blocked: true, outstanding: [{ id: 'c1', title: 'Islamic Architecture', date: '2026-08-14' }] } },
      { onCatchUp },
    );

    const button = cta()!;
    expect(button.textContent).toBe('Go to my catch-up');
    fireEvent.click(button);
    expect(onCatchUp).toHaveBeenCalledWith('/student/catch-up');
  });

  it('stays silent rather than offering a button the caller never wired up', () => {
    // MyTestsLibrary passes no onAskTeacher. A dead "Ask my teacher" there would
    // be the same dead end in a new costume.
    render(
      <StudentTestCard test={make({ available_until: new Date(NOW - DAY).toISOString() })} onStart={vi.fn()} />,
    );
    expect(screen.queryByTestId('test-card-cta')).toBeNull();
  });

  it('names the test in the button label, so ten cards are distinguishable by ear', () => {
    renderCard();
    expect(cta()!.getAttribute('aria-label')).toBe('Start the test: History of Architecture Test');
  });

  it('prints the title once, not twice', () => {
    renderCard({ class_title: 'History of Architecture Test' });
    expect(screen.queryAllByText('History of Architecture Test')).toHaveLength(1);
  });

  it('shows the class when it adds something the title does not', () => {
    renderCard({ class_title: 'Indo-Aryan Temple Architecture' });
    expect(screen.queryByText('Indo-Aryan Temple Architecture')).not.toBeNull();
  });

  /** Hari Heera's card: two practice runs, zero exam sittings. */
  it('calls practice practice instead of showing it as the exam score', () => {
    renderCard({
      is_exam: true,
      attempt_limit: 1,
      attempts: 0,
      available_until: new Date(NOW + DAY).toISOString(),
      practice_elsewhere: { attempts: 2, best_percentage: 76 },
    });

    expect(screen.queryByText(/You practised this paper 2 times, best 76%/)).not.toBeNull();
    // Never as the headline number.
    expect(screen.queryByText('76%')).toBeNull();
    expect(cta()!.textContent).toBe('Start the test');
  });

  it('labels an exam number a score and a practice number a best', () => {
    const { unmount } = render(
      <StudentTestCard
        test={make({ is_exam: true, attempts: 1, best_percentage: 82, results_state: 'final' })}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByText('Your score')).not.toBeNull();
    unmount();

    render(<StudentTestCard test={make({ attempts: 3, best_percentage: 82 })} onStart={vi.fn()} />);
    expect(screen.queryByText('Best')).not.toBeNull();
  });

  it('keeps the selection mode the library depends on', () => {
    const onToggleSelect = vi.fn();
    render(
      <StudentTestCard test={make()} onStart={vi.fn()} selectable selected={false} onToggleSelect={onToggleSelect} />,
    );
    // No start button while selecting: tapping one would drop the selection
    // the student was halfway through building.
    expect(screen.queryByTestId('test-card-cta')).toBeNull();
    // Exactly one checkbox, and it is named. The card itself used to claim the
    // role too, so a screen reader met two controls for one choice.
    const boxes = screen.queryAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute('aria-label')).toBe('Select History of Architecture Test');
    fireEvent.click(boxes[0]);
    expect(onToggleSelect).toHaveBeenCalledWith('t1');
  });

  it('renders the same card a year from now, because the clock is not its input', () => {
    const test = make({ available_until: new Date(NOW + 2 * DAY).toISOString() });
    const first = test.card!.reason;
    vi.setSystemTime(new Date(NOW + 365 * DAY));
    render(<StudentTestCard test={test} onStart={vi.fn()} />);
    expect(screen.queryByText(first)).not.toBeNull();
    expect((screen.getByTestId('test-card-cta') as HTMLButtonElement).disabled).toBe(false);
    vi.useRealTimers();
  });
});

describe('examResultChip', () => {
  const exam: StudentTest = { ...base, is_exam: true };

  it('says nothing on anything that is not an exam', () => {
    expect(examResultChip({ ...exam, is_exam: false, exam_result: null })).toBeNull();
  });

  it('says nothing until a result is actually published', () => {
    // The strip carries "Your result is not out yet" as a whole sentence now, so
    // a chip repeating it would be the scattered status this redesign removed.
    expect(examResultChip({ ...exam, status: 'done', exam_result: null })).toBeNull();
  });

  it('gives the rank a student wants to find at a glance', () => {
    const chip = examResultChip({
      ...exam,
      exam_result: { rank: 3, total_ranked: 42, score: 76, total_marks: 100, percentage: 76, is_provisional: false, absent: false },
    });
    expect(chip).toEqual({ label: 'Rank 3 of 42', color: 'success' });
  });

  it('marks a provisional rank as provisional, since it can still move', () => {
    const chip = examResultChip({
      ...exam,
      exam_result: { rank: 3, total_ranked: 42, score: 76, total_marks: 100, percentage: 76, is_provisional: true, absent: false },
    });
    expect(chip).toEqual({ label: 'Rank 3 of 42 · Provisional', color: 'warning' });
  });

  it('leaves an absent student to the sentence rather than a bare chip', () => {
    expect(
      examResultChip({
        ...exam,
        exam_result: { rank: null, total_ranked: 42, score: null, total_marks: 100, percentage: null, is_provisional: false, absent: true },
      }),
    ).toBeNull();
  });
});

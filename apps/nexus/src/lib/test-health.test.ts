import { describe, expect, it } from 'vitest';
import {
  affectedStudentsByPhase,
  attemptIdsToLookUp,
  collectTestIssues,
  hasBlockingIssue,
  realFailures,
  reportedIssues,
  buildHealthPrompt,
  HEALTH_PROMPT_LIMIT,
  structuralIssues,
  technicalIssues,
  type AttemptErrorRow,
  type CheckableQuestion,
} from './test-health';

const q = (over: Partial<CheckableQuestion> = {}): CheckableQuestion => ({
  id: 'q1',
  is_active: true,
  correct_answer: 'a',
  question_text: 'What year?',
  question_image_url: null,
  question_format: 'MCQ',
  options: [{ id: 'a' }, { id: 'b' }],
  ...over,
});

const structural = (questions: CheckableQuestion[], title?: string) =>
  structuralIssues({ question_count: questions.length, questions, title });

describe('structuralIssues', () => {
  it('finds nothing wrong with a healthy paper', () => {
    expect(structural([q(), q({ id: 'q2' })])).toEqual([]);
  });

  /**
   * composeTest refuses to create a paper with no questions, so an empty one
   * means its questions were deleted from the bank afterwards. It is also the
   * only case where reporting anything else would be noise, hence the early
   * return.
   */
  it('reports an empty paper as a single fatal problem and stops there', () => {
    const issues = structuralIssues({ question_count: 0, questions: [], title: 'Practice - 10 questions' });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('no questions');
  });

  it('catches questions deactivated in the bank after the paper was built', () => {
    const issues = structural([q(), q({ id: 'q2', is_active: false })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].count).toBe(1);
    expect(issues[0].title).toContain('removed from the question bank');
  });

  // Ungradeable reads to a student as a wrong answer they cannot argue with.
  it('catches a question with no correct answer', () => {
    const issues = structural([q({ correct_answer: null }), q({ id: 'q2', correct_answer: '  ' })]);
    expect(issues.some((i) => i.title.includes('no correct answer') && i.count === 2)).toBe(true);
  });

  // A deactivated question is already reported once. Reporting it again for
  // every other check would turn one problem into four.
  it('does not re-report a deactivated question under every other check', () => {
    const issues = structural([q({ is_active: false, correct_answer: null, question_text: null })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('removed from the question bank');
  });

  it('catches a question with neither text nor an image', () => {
    const issues = structural([q({ question_text: '   ', question_image_url: null })]);
    expect(issues.some((i) => i.title.includes('neither text nor an image'))).toBe(true);
  });

  it('accepts an image-only question, which is normal for spatial reasoning', () => {
    const issues = structural([q({ question_text: null, question_image_url: 'https://x/y.png' })]);
    expect(issues).toEqual([]);
  });

  it('catches a multiple-choice question that offers no choice', () => {
    const issues = structural([q({ options: [{ id: 'a' }] })]);
    expect(issues.some((i) => i.title.includes('fewer than two options'))).toBe(true);
  });

  it('does not demand options from a non-choice format', () => {
    expect(structural([q({ question_format: 'NUMERIC', options: null })])).toEqual([]);
  });

  /**
   * The production case: "Practice - 0 questions" sits on a paper holding 544.
   * Harmless to a student sitting it, actively misleading to staff scanning a
   * list, which is exactly who this warning is for.
   */
  it('catches a title that contradicts the question count', () => {
    const issues = structural([q(), q({ id: 'q2' })], 'Practice - 0 questions');
    const mismatch = issues.find((i) => i.title.includes('The name says'));
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('warning');
    expect(mismatch!.title).toContain('holds 2');
  });

  it('says nothing when the title agrees with the paper', () => {
    expect(structural([q(), q({ id: 'q2' })], 'Practice - 2 questions')).toEqual([]);
  });

  it('ignores a title that claims no count at all', () => {
    expect(structural([q()], 'Puzzle Test')).toEqual([]);
  });
});

describe('technicalIssues', () => {
  it('groups failures into one line per phase, commonest first', () => {
    const issues = technicalIssues([
      { phase: 'image' },
      { phase: 'image' },
      { phase: 'image' },
      { phase: 'submit' },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0].count).toBe(3);
    expect(issues[0].title).toContain('could not load a question image');
  });

  // Losing your submitted answers is categorically worse than one missing
  // figure, and the severities have to reflect that or the panel misleads.
  it('treats load, submit and grade as errors and image as a warning', () => {
    expect(technicalIssues([{ phase: 'load' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'submit' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'grade' }])[0].severity).toBe('error');
    expect(technicalIssues([{ phase: 'image' }])[0].severity).toBe('warning');
    expect(technicalIssues([{ phase: 'render' }])[0].severity).toBe('warning');
  });

  it('renders an unrecognised phase rather than dropping it', () => {
    const issues = technicalIssues([{ phase: 'teleport' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('unrecognised error');
  });

  it('says nothing for a paper nothing went wrong with', () => {
    expect(technicalIssues([])).toEqual([]);
  });

  /**
   * "21 students could not submit" on acf8084d was 21 ROWS. One student tapping
   * Submit three times is one student, and the sentence says students.
   */
  it('counts distinct students, not rows', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ phase: 'submit', student_id: 'asha' })),
      ...Array.from({ length: 5 }, () => ({ phase: 'submit', student_id: 'bala' })),
      { phase: 'submit', student_id: 'chitra' },
    ];
    const issues = technicalIssues(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0].count).toBe(3);
    expect(issues[0].title).toBe('3 students could not submit their answers');
    expect(issues[0].phase).toBe('submit');
  });

  it('says "1 student" for one student however many rows they wrote', () => {
    expect(technicalIssues([{ phase: 'load', student_id: 'a' }, { phase: 'load', student_id: 'a' }])[0].title).toBe(
      '1 student failed to open the paper',
    );
  });
});

/** Shaped like the real rows on acf8084d, read on production 2026-09-17. */
function acf8084dRows(): AttemptErrorRow[] {
  const rows: AttemptErrorRow[] = [];
  const at = (minute: number) => `2026-09-11T10:${String(minute).padStart(2, '0')}:00Z`;
  // The real bug, fixed in fd1c945d: 12 rows from 4 reopened students.
  ['r1', 'r2', 'r3', 'r4'].forEach((s, i) => {
    for (let n = 0; n < 3; n++) {
      rows.push({ phase: 'submit', student_id: s, attempt_id: `open-${s}`, message: 'EXAM_CLOSED', detail: { status: 500 }, created_at: at(i * 3 + n) });
    }
  });
  // 9 rows from 8 students who had already submitted.
  ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd8'].forEach((s, i) =>
    rows.push({
      phase: 'submit',
      student_id: s,
      attempt_id: `done-${s}`,
      message: 'This attempt is already finished. Start a new one to try again.',
      detail: { status: 409 },
      created_at: at(20 + i),
    }),
  );
  // 9 rows from 7 students who had already sat it.
  ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l1', 'l2'].forEach((s, i) =>
    rows.push({ phase: 'load', student_id: s, message: 'You have used all your attempts at this test.', detail: { status: 403 }, created_at: at(30 + i) }),
  );
  // 3 rows from 1 student sent from practice to the live exam.
  for (let n = 0; n < 3; n++) {
    rows.push({
      phase: 'load',
      student_id: 'p1',
      message: 'This paper is your class exam right now. Take it from the exam, where it counts.',
      detail: { status: 409 },
      created_at: at(40 + n),
    });
  }
  return rows;
}

describe('realFailures', () => {
  const submittedAttempts = () =>
    new Map(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'].map((s) => [`done-${s}`, 'submitted']));

  it('turns the acf8084d banner into the one real problem it had', () => {
    const rows = realFailures(acf8084dRows(), { attemptStatusById: submittedAttempts() });
    const issues = technicalIssues(rows);
    expect(issues.map((i) => i.title)).toEqual(['4 students could not submit their answers']);
  });

  it('keeps a closed-attempt submit whose attempt was NOT submitted, because that work was lost', () => {
    const status = submittedAttempts();
    status.set('done-d1', 'abandoned');
    const rows = realFailures(acf8084dRows(), { attemptStatusById: status });
    expect(technicalIssues(rows)[0].title).toBe('5 students could not submit their answers');
  });

  it('uses the attempt status a newer row carried itself', () => {
    const rows = realFailures(
      [
        {
          phase: 'submit',
          student_id: 's',
          attempt_id: 'a',
          message: 'This attempt is already finished. Start a new one to try again.',
          detail: { status: 409, code: 'ATTEMPT_CLOSED', attempt_status: 'submitted' },
        },
      ],
      {},
    );
    expect(rows).toEqual([]);
  });

  it('drops staff previews', () => {
    const rows = realFailures(
      [
        { phase: 'image', student_id: 'teacher-1', message: 'Question image failed to load' },
        { phase: 'image', student_id: 'student-1', message: 'Question image failed to load' },
      ],
      { staffIds: new Set(['teacher-1']) },
    );
    expect(rows.map((r) => r.student_id)).toEqual(['student-1']);
  });

  it('hides everything at or before the latest "Mark as fixed", and shows what came after', () => {
    const rows = realFailures(
      [
        { phase: 'image', student_id: 'a', message: 'x', created_at: '2026-09-17T09:00:00Z' },
        { phase: 'image', student_id: 'b', message: 'x', created_at: '2026-09-17T10:00:00Z' },
        { phase: 'image', student_id: 'c', message: 'x', created_at: '2026-09-17T11:00:00Z' },
      ],
      { clearedAt: '2026-09-17T10:00:00Z' },
    );
    expect(rows.map((r) => r.student_id)).toEqual(['c']);
  });

  it('shows everything when the paper was never marked fixed', () => {
    expect(realFailures([{ phase: 'image', student_id: 'a', message: 'x', created_at: '2020-01-01T00:00:00Z' }], { clearedAt: null })).toHaveLength(1);
  });
});

describe('attemptIdsToLookUp', () => {
  it('asks only about closed-attempt submits that did not record the answer themselves', () => {
    const ids = attemptIdsToLookUp([
      ...acf8084dRows(),
      {
        phase: 'submit',
        student_id: 'x',
        attempt_id: 'already-known',
        message: 'This attempt is already finished. Start a new one to try again.',
        detail: { status: 409, attempt_status: 'submitted' },
      },
    ]);
    expect(ids.sort()).toEqual(['done-d1', 'done-d2', 'done-d3', 'done-d4', 'done-d5', 'done-d6', 'done-d7', 'done-d8']);
  });
});

describe('affectedStudentsByPhase', () => {
  it('lists each student once per phase with their latest message, when it last happened and how often', () => {
    const byPhase = affectedStudentsByPhase([
      { phase: 'submit', student_id: 'asha', message: 'Failed to fetch', created_at: '2026-09-17T09:00:00Z' },
      { phase: 'submit', student_id: 'asha', message: 'Submit failed (HTTP 502)', created_at: '2026-09-17T09:05:00Z' },
      { phase: 'submit', student_id: 'bala', message: 'Failed to fetch', created_at: '2026-09-17T09:10:00Z' },
      { phase: 'image', student_id: 'asha', message: 'Question image failed to load', created_at: '2026-09-17T08:00:00Z' },
    ]);
    expect(byPhase.submit).toEqual([
      { student_id: 'bala', last_at: '2026-09-17T09:10:00Z', message: 'Failed to fetch', times: 1 },
      { student_id: 'asha', last_at: '2026-09-17T09:05:00Z', message: 'Submit failed (HTTP 502)', times: 2 },
    ]);
    expect(byPhase.image).toHaveLength(1);
  });

  it('skips rows with no student to name', () => {
    expect(affectedStudentsByPhase([{ phase: 'load', message: 'x' }])).toEqual({});
  });
});

describe('reportedIssues', () => {
  // A student looked at a question and said it is wrong. That is at least as
  // strong a signal as a machine fault, so it carries the same severity.
  it('treats student reports as errors', () => {
    const issues = reportedIssues([{ report_type: 'wrong_answer' }, { report_type: 'no_correct_option' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].count).toBe(2);
  });

  it('says nothing when nobody has reported anything', () => {
    expect(reportedIssues([])).toEqual([]);
  });
});

describe('collectTestIssues', () => {
  it('puts errors above warnings, then the widest impact first', () => {
    const issues = collectTestIssues({
      structural: { question_count: 3, questions: [q(), q({ id: 'q2' }), q({ id: 'q3', options: [{ id: 'a' }] })] },
      errors: [{ phase: 'image' }, { phase: 'image' }, { phase: 'submit' }],
      reports: [{ report_type: 'wrong_answer' }],
    });
    expect(issues.every((i, idx) => idx === 0 || issues[idx - 1].severity <= i.severity)).toBe(true);
    expect(issues[0].severity).toBe('error');
    expect(issues[issues.length - 1].severity).toBe('warning');
  });

  it('combines all three streams', () => {
    const issues = collectTestIssues({
      structural: { question_count: 1, questions: [q({ correct_answer: null })] },
      errors: [{ phase: 'load' }],
      reports: [{ report_type: 'unclear_question' }],
    });
    expect(new Set(issues.map((i) => i.stream))).toEqual(new Set(['structural', 'technical', 'reported']));
  });

  it('returns nothing for a healthy paper with no history', () => {
    expect(collectTestIssues({ structural: { question_count: 1, questions: [q()] } })).toEqual([]);
    expect(collectTestIssues({})).toEqual([]);
  });
});

describe('hasBlockingIssue', () => {
  it('is true when anything is an error', () => {
    expect(hasBlockingIssue(technicalIssues([{ phase: 'submit' }]))).toBe(true);
  });

  it('is false for warnings alone', () => {
    expect(hasBlockingIssue(technicalIssues([{ phase: 'image' }]))).toBe(false);
    expect(hasBlockingIssue([])).toBe(false);
  });
});

describe('buildHealthPrompt', () => {
  const base = {
    testTitle: 'History of Architecture Test',
    testId: 'acf8084d',
    placementId: 'c39e7fe6',
    runLabel: 'Exam: 18 Aug',
    pageUrl: 'http://localhost:3012/teacher/tests/acf8084d?tab=students',
    issues: [] as ReturnType<typeof technicalIssues>,
    affected: {} as Record<string, Array<{ student_id: string; last_at: string | null; message: string; times: number; name?: string | null }>>,
    reports: [] as Array<{ report_type?: string | null; description?: string | null }>,
  };

  it('names the paper, the run and the screen', () => {
    const text = buildHealthPrompt(base);
    expect(text).toContain('History of Architecture Test');
    expect(text).toContain('nexus_tests.id acf8084d');
    expect(text).toContain('nexus_test_placements.id c39e7fe6');
    expect(text).toContain('Exam: 18 Aug');
    expect(text).toContain(base.pageUrl);
  });

  it('lists the students an App problem happened to, with what the app said', () => {
    const text = buildHealthPrompt({
      ...base,
      issues: technicalIssues([{ phase: 'submit', student_id: 's1' }, { phase: 'submit', student_id: 's2' }]),
      affected: {
        submit: [
          { student_id: 's1', name: 'Kaveya Rameshbabu', last_at: '2026-09-17T12:34:00Z', message: 'EXAM_CLOSED', times: 3 },
          { student_id: 's2', name: null, last_at: null, message: '', times: 1 },
        ],
      },
    });
    expect(text).toContain('[App] 2 students could not submit their answers (phase: submit)');
    expect(text).toContain('Kaveya Rameshbabu: 3 times');
    expect(text).toContain('message: EXAM_CLOSED');
    // No name recorded falls back to the id rather than printing "null".
    expect(text).toContain('s2: 1 time');
    expect(text).toContain('message: none recorded');
  });

  it('counts the students it does not list', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      student_id: `s${i}`,
      name: `Student ${i}`,
      last_at: '2026-09-17T12:00:00Z',
      message: 'boom',
      times: 1,
    }));
    const text = buildHealthPrompt({
      ...base,
      issues: technicalIssues(many.map((m) => ({ phase: 'submit', student_id: m.student_id }))),
      affected: { submit: many },
    });
    expect(text).toContain('and 3 more students');
  });

  it('carries what students wrote, and skips empty reports', () => {
    const text = buildHealthPrompt({
      ...base,
      issues: reportedIssues([{ report_type: 'wrong_answer' }]),
      reports: [
        { report_type: 'wrong_answer', description: 'Option B is also right' },
        { report_type: 'other', description: '   ' },
      ],
    });
    expect(text).toContain('WHAT STUDENTS SAID');
    expect(text).toContain('[wrong_answer] Option B is also right');
    expect(text.match(/^- \[/gm)).toHaveLength(1);
  });

  it('says what to do and refuses to deploy', () => {
    const text = buildHealthPrompt(base);
    expect(text).toContain('add a regression test that fails without the fix');
    expect(text).toContain('Do not deploy');
  });

  it('truncates rather than handing over an unusable paste', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      student_id: `student-${i}`,
      name: `A very long student name number ${i} indeed`,
      last_at: '2026-09-17T12:00:00Z',
      message: 'x'.repeat(200),
      times: 2,
    }));
    const text = buildHealthPrompt({
      ...base,
      issues: [
        { stream: 'technical', severity: 'error', title: 'lots', count: 400, phase: 'submit' },
        { stream: 'technical', severity: 'error', title: 'lots', count: 400, phase: 'load' },
      ],
      // Past the per-issue cap, so the length has to come from many issues.
      affected: { submit: many.slice(0, 12), load: many.slice(0, 12) },
      reports: many.map((m) => ({ report_type: 'other', description: m.message })),
    });
    expect(text.length).toBeLessThanOrEqual(HEALTH_PROMPT_LIMIT + 60);
    expect(text).toContain('(truncated');
  });
});

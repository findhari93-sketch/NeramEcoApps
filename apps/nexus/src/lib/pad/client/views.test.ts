// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { answerTypeLabel, displayAnswer, displayKeys, scoreLabel } from './format';
import { deriveStudentView, isTimeUp, nextRoundId, qbButtonTexts, studentAnnouncement, type PendingSubmit } from './student-view';
import {
  consoleAnnouncement,
  deriveConsoleView,
  groupParticipation,
  effectiveKeys,
  keyChoices,
  mcqLetters,
  reminderMessage,
  revealSummary,
  toggleKey,
} from './teacher-view';
import type { ParticipationRow, StudentPrompt, StudentSnapshot, TeacherPrompt, TeacherSnapshot } from './types';

const SCORE = { correct: 0, wrong: 0, skipped: 0, absent: 0, total_graded: 0 };

function studentPrompt(overrides: Partial<StudentPrompt> = {}): StudentPrompt {
  return {
    id: 'p1',
    sequence: 1,
    label: null,
    question_text: null,
    image_url: null,
    option_texts: null,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    version: 1,
    ungraded: null,
    correct_keys: null,
    ...overrides,
  };
}

function studentSnap(overrides: Partial<StudentSnapshot> = {}): StudentSnapshot {
  return {
    ok: true,
    role: 'student',
    server_time: '2026-09-10T10:00:00Z',
    session: { id: 's1', status: 'live', hint_topic: 'pad-x', classroom_name: 'NATA Batch' },
    prompt: studentPrompt(),
    my_response: null,
    my_skip: null,
    nudged_at: null,
    score: SCORE,
    ...overrides,
  };
}

const mine = (answer: string, is_correct: boolean | null = null) => ({ answer, raw_answer: answer, responded_at: '2026-09-10T10:00:05Z', is_correct });
const pending = (status: PendingSubmit['status'], promptId = 'p1'): PendingSubmit => ({ promptId, answer: 'B', status });

describe('deriveStudentView', () => {
  const seen = new Set(['p1']);
  const unseen = new Set<string>();

  it('waits for the first snapshot, then shows idle before any question', () => {
    expect(deriveStudentView(null, null, seen)).toEqual({ kind: 'loading' });
    expect(deriveStudentView(studentSnap({ prompt: null }), null, seen)).toEqual({ kind: 'idle', classroomName: 'NATA Batch' });
  });

  it('shows the round as ended, whatever else the snapshot holds, and whether results are out', () => {
    const ended = (extra: Partial<StudentSnapshot['session']>) =>
      studentSnap({ session: { id: 's1', status: 'ended', hint_topic: 'x', classroom_name: null, ...extra } });
    expect(deriveStudentView(ended({ round_no: 2 }), pending('sending'), seen)).toEqual({ kind: 'ended', roundNo: 2, published: false });
    expect(deriveStudentView(ended({ round_no: 2, results_published_at: '2026-09-10T11:00:00Z' }), null, seen)).toEqual({
      kind: 'ended',
      roundNo: 2,
      published: true,
    });
    expect(deriveStudentView(ended({}), null, seen)).toEqual({ kind: 'ended', roundNo: null, published: false });
  });

  it('offers the answer controls while OPEN, with nothing chosen yet', () => {
    expect(deriveStudentView(studentSnap(), null, seen)).toEqual({ kind: 'answering', prompt: studentPrompt(), selected: null, save: null });
  });

  it('keeps the options live after answering, showing the saved answer as chosen', () => {
    expect(deriveStudentView(studentSnap({ my_response: mine('C') }), null, seen)).toMatchObject({ kind: 'answering', selected: 'C', save: 'saved' });
  });

  it('shows the answer being sent as chosen, even over the one the server holds', () => {
    expect(deriveStudentView(studentSnap(), pending('sending'), seen)).toMatchObject({ kind: 'answering', selected: 'B', save: 'sending' });
    expect(deriveStudentView(studentSnap(), pending('retrying'), seen)).toMatchObject({ kind: 'answering', selected: 'B', save: 'retrying' });
    // Changing C to B: B is on its way.
    expect(deriveStudentView(studentSnap({ my_response: mine('C') }), pending('sending'), seen)).toMatchObject({ selected: 'B', save: 'sending' });
  });

  it('locks at CLOSE, and the server answer wins over anything still being sent', () => {
    const closed = studentSnap({ prompt: studentPrompt({ state: 'closed' }), my_response: mine('C') });
    expect(deriveStudentView(closed, null, seen)).toMatchObject({ kind: 'locked', answer: 'C' });
    expect(deriveStudentView(closed, pending('retrying'), seen)).toMatchObject({ kind: 'locked', answer: 'C' });
  });

  it('shows Sending when the question closes while the only answer is still on its way', () => {
    const closed = studentSnap({ prompt: studentPrompt({ state: 'closed' }) });
    expect(deriveStudentView(closed, pending('sending'), seen)).toMatchObject({ kind: 'saving', answer: 'B', retrying: false });
    expect(deriveStudentView(closed, pending('retrying'), seen)).toMatchObject({ kind: 'saving', retrying: true });
  });

  it('shows the answer that stands when a late change was refused, even on an older snapshot', () => {
    const refused: PendingSubmit = { promptId: 'p1', answer: 'D', status: 'refused', standing: 'A' };
    expect(deriveStudentView(studentSnap({ my_response: mine('A') }), refused, seen)).toMatchObject({ kind: 'locked', answer: 'A' });
    expect(deriveStudentView(studentSnap({ prompt: studentPrompt({ state: 'closed' }), my_response: mine('A') }), refused, seen)).toMatchObject({
      kind: 'locked',
      answer: 'A',
    });
  });

  it('ignores a pending answer for a previous question', () => {
    expect(deriveStudentView(studentSnap({ prompt: studentPrompt({ id: 'p2', sequence: 2 }) }), pending('refused', 'p1'), seen)).toMatchObject({
      kind: 'answering',
      selected: null,
    });
  });

  it('tells apart the three ways of missing a question', () => {
    const closed = studentSnap({ prompt: studentPrompt({ state: 'closed' }) });
    expect(deriveStudentView(closed, pending('refused'), seen)).toMatchObject({ kind: 'missed', reason: 'closed-before-arrival', revealed: false });
    expect(deriveStudentView(closed, null, unseen)).toMatchObject({ kind: 'missed', reason: 'joined-after-close' });
    expect(deriveStudentView(closed, null, seen)).toMatchObject({ kind: 'missed', reason: 'did-not-answer' });
  });

  it('shows the result at REVEAL: correct, incorrect, poll, or missed with the answer', () => {
    const revealed = (overrides: Partial<StudentPrompt>, response: StudentSnapshot['my_response']) =>
      studentSnap({ prompt: studentPrompt({ state: 'revealed', ungraded: false, correct_keys: ['B'], ...overrides }), my_response: response });

    expect(deriveStudentView(revealed({}, mine('B', true)), null, seen)).toMatchObject({ kind: 'result', outcome: 'correct', answer: 'B' });
    expect(deriveStudentView(revealed({}, mine('A', false)), null, seen)).toMatchObject({ kind: 'result', outcome: 'incorrect' });
    expect(deriveStudentView(revealed({ ungraded: true, correct_keys: null }, mine('A', null)), null, seen)).toMatchObject({ kind: 'result', outcome: 'poll' });
    expect(deriveStudentView(revealed({}, null), null, unseen)).toMatchObject({ kind: 'missed', reason: 'joined-after-close', revealed: true });
  });
});

describe('nextRoundId', () => {
  const session = (extra: Partial<StudentSnapshot['session']>) => studentSnap({ session: { ...studentSnap().session, ...extra } });

  it('follows the next round only once this one has ended and names another', () => {
    expect(nextRoundId(null)).toBeNull();
    expect(nextRoundId(session({ status: 'live', next_session_id: 's2' }))).toBeNull();
    expect(nextRoundId(session({ status: 'ended', next_session_id: null }))).toBeNull();
    expect(nextRoundId(session({ status: 'ended' }))).toBeNull();
    expect(nextRoundId(session({ status: 'ended', next_session_id: 's1' }))).toBeNull();
    expect(nextRoundId(session({ status: 'ended', next_session_id: 's2' }))).toBe('s2');
  });
});

function teacherPrompt(overrides: Partial<TeacherPrompt> = {}): TeacherPrompt {
  return {
    id: 'p1',
    sequence: 1,
    answer_type: 'mcq',
    option_count: 4,
    state: 'open',
    version: 1,
    correct_keys: null,
    ungraded: false,
    label: null,
    question_text: null,
    image_url: null,
    option_texts: null,
    opened_at: '2026-09-10T10:00:00Z',
    closed_at: null,
    revealed_at: null,
    answered_count: 3,
    last_nudged_at: null,
    ...overrides,
  };
}

const COUNTS = { enrolled: 30, answered: 20, silent: 6, absent: 4, correct: 12, incorrect: 8, answered_off_roster: 1 };

function teacherSnap(overrides: Partial<TeacherSnapshot> = {}): TeacherSnapshot {
  return {
    ok: true,
    role: 'teacher',
    server_time: '2026-09-10T10:00:00Z',
    session: {
      id: 's1',
      status: 'live',
      room_code: '482913',
      hint_topic: 'pad-x',
      teacher_topic: 'padt-x',
      classroom_id: 'c1',
      classroom_name: 'NATA Batch',
      scheduled_class_id: null,
      batch_id: null,
      meeting_id: null,
      created_at: '2026-09-10T09:55:00Z',
      ended_at: null,
      presence_basis: 'app',
      bot_in_meeting: false,
    },
    readiness: { enrolled: 30, connected: 25, in_meeting: 0 },
    prompt: teacherPrompt(),
    counts: COUNTS,
    groups: [],
    skips: { total: 0, by_reason: {} },
    history: [],
    ...overrides,
  };
}

describe('deriveConsoleView', () => {
  it('moves through ready, open, closed and revealed, and ends', () => {
    expect(deriveConsoleView(null)).toEqual({ kind: 'loading' });
    expect(deriveConsoleView(teacherSnap({ prompt: null, counts: null }))).toEqual({ kind: 'ready' });
    expect(deriveConsoleView(teacherSnap())).toMatchObject({ kind: 'open', answered: 20, enrolled: 30, offRoster: 1 });
    expect(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'revealed' }) }))).toMatchObject({ kind: 'revealed' });
    expect(deriveConsoleView(teacherSnap({ session: { ...teacherSnap().session, status: 'ended' } }))).toEqual({ kind: 'ended' });
  });

  it('lets REVEAL go ahead only once a key or a poll is chosen', () => {
    expect(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'closed' }) }))).toMatchObject({ kind: 'closed', decided: false });
    expect(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'closed', correct_keys: ['B'] }) }))).toMatchObject({ decided: true });
    expect(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'closed', ungraded: true }) }))).toMatchObject({ decided: true });
  });

  it('falls back to the raw answer count when counts are missing', () => {
    expect(deriveConsoleView(teacherSnap({ counts: null }))).toMatchObject({ kind: 'open', answered: 3, enrolled: 30, offRoster: 0 });
  });
});

describe('key selection', () => {
  it('lists the letters of a multiple choice question, clamped to two through six', () => {
    expect(mcqLetters(4)).toEqual(['A', 'B', 'C', 'D']);
    expect(mcqLetters(9)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(mcqLetters(1)).toEqual(['A', 'B']);
    expect(mcqLetters(null)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('offers every option for choice questions and the given answers for numbers and text', () => {
    const groups = [
      { value: 'B', count: 12 },
      { value: 'A', count: 3 },
    ];
    expect(keyChoices({ answer_type: 'mcq', option_count: 3, correct_keys: ['B'] }, groups)).toEqual([
      { value: 'A', count: 3, selected: false },
      { value: 'B', count: 12, selected: true },
      { value: 'C', count: 0, selected: false },
    ]);
    expect(keyChoices({ answer_type: 'yesno', option_count: null, correct_keys: null }, [{ value: 'no', count: 2 }])).toEqual([
      { value: 'yes', count: 0, selected: false },
      { value: 'no', count: 2, selected: false },
    ]);
    expect(keyChoices({ answer_type: 'numeric', option_count: null, correct_keys: ['42'] }, [{ value: '41', count: 5 }])).toEqual([
      { value: '41', count: 5, selected: false },
      { value: '42', count: 0, selected: true },
    ]);
  });

  it('adds and removes keys, but never removes the last one', () => {
    expect(toggleKey(null, 'B')).toEqual(['B']);
    expect(toggleKey(['B'], 'A')).toEqual(['A', 'B']);
    expect(toggleKey(['A', 'B'], 'A')).toEqual(['B']);
    expect(toggleKey(['B'], 'B')).toBeNull();
  });
});

describe('reveal summary and details', () => {
  it('shows four groups for a graded question and three for a poll', () => {
    expect(revealSummary(COUNTS, false).map((item) => [item.key, item.count])).toEqual([
      ['correct', 12],
      ['incorrect', 8],
      ['silent', 6],
      ['absent', 4],
    ]);
    expect(revealSummary(COUNTS, true).map((item) => item.key)).toEqual(['answered', 'silent', 'absent']);
    expect(revealSummary(null, false)).toEqual([]);
  });

  it('sorts named rows into the same groups', () => {
    const row = (overrides: Partial<ParticipationRow>): ParticipationRow => ({
      student_id: Math.random().toString(36),
      name: 'Student',
      on_roster: true,
      participation: 'answered',
      result: 'correct',
      answer: 'B',
      joined_mid_prompt: false,
      ...overrides,
    });
    const rows = [row({}), row({ result: 'incorrect' }), row({ participation: 'silent', result: null, answer: null }), row({ participation: 'absent', result: null, answer: null })];

    const graded = groupParticipation(rows, false);
    expect([graded.correct.length, graded.incorrect.length, graded.answered.length, graded.silent.length, graded.absent.length]).toEqual([1, 1, 0, 1, 1]);

    const poll = groupParticipation(rows, true);
    expect([poll.correct.length, poll.incorrect.length, poll.answered.length]).toEqual([0, 0, 2]);
  });
});

describe('format', () => {
  it('reads answers and keys in plain words', () => {
    expect(displayAnswer('yesno', 'yes')).toBe('Yes');
    expect(displayAnswer('mcq', 'B')).toBe('B');
    expect(displayKeys('mcq', ['B'])).toBe('B');
    expect(displayKeys('mcq', ['A', 'C'])).toBe('A or C');
    expect(displayKeys('numeric', ['12', '12.5', '13'])).toBe('12, 12.5 or 13');
    expect(displayKeys('text', null)).toBe('');
  });

  it('never shows a zero score before anything is graded', () => {
    expect(scoreLabel(SCORE)).toBe('No score yet');
    expect(scoreLabel(null)).toBe('No score yet');
    expect(scoreLabel({ ...SCORE, correct: 3, total_graded: 4 })).toBe('3 of 4');
  });

  it('labels each answer type without dashes', () => {
    expect(answerTypeLabel('mcq', 4)).toBe('A to D');
    expect(answerTypeLabel('mcq', 6)).toBe('A to F');
    expect(answerTypeLabel('mcq', 2)).toBe('A to B');
    expect(answerTypeLabel('yesno')).toBe('Yes or No');
    for (const type of ['mcq', 'numeric', 'text', 'yesno'] as const) {
      expect(answerTypeLabel(type, 4)).not.toMatch(/[–—]|--/);
    }
  });
});

describe('screen reader announcements', () => {
  it('names each student state in plain words', () => {
    const seen = new Set(['p1']);
    const said = [
      deriveStudentView(null, null, seen),
      deriveStudentView(studentSnap({ prompt: null }), null, seen),
      deriveStudentView(studentSnap(), null, seen),
      deriveStudentView(studentSnap(), pending('sending'), seen),
      deriveStudentView(studentSnap(), pending('retrying'), seen),
      deriveStudentView(studentSnap({ my_response: mine('B') }), null, seen),
      deriveStudentView(studentSnap({ prompt: studentPrompt({ state: 'closed' }), my_response: mine('B') }), null, seen),
      deriveStudentView(
        studentSnap({ prompt: studentPrompt({ state: 'revealed', ungraded: false, correct_keys: ['B'] }), my_response: mine('B', true) }),
        null,
        seen,
      ),
    ].map(studentAnnouncement);

    expect(said).toEqual([
      'Connecting to your class.',
      'Connected. Waiting for a question.',
      'Question 1 is open.',
      'Saving your answer.',
      'Still trying to save your answer.',
      'Your answer B is saved.',
      'Answering has closed. Your answer B is locked.',
      'Correct.',
    ]);
    for (const line of said) expect(line).not.toMatch(/[–—]|--/);
  });

  it('says when a round ends and when its result is ready', () => {
    const seen = new Set(['p1']);
    const ended = (published: boolean) =>
      deriveStudentView(
        studentSnap({
          session: { id: 's1', status: 'ended', hint_topic: 'x', classroom_name: null, round_no: 1, results_published_at: published ? '2026-09-10T11:00:00Z' : null },
        }),
        null,
        seen,
      );
    expect(studentAnnouncement(ended(false))).toBe('This round has ended.');
    expect(studentAnnouncement(ended(true))).toBe('This round has ended. Your result is ready.');
  });

  it('announces console state changes, not every change of the counter', () => {
    expect(consoleAnnouncement(deriveConsoleView(teacherSnap()))).toBe('Question 1 is open.');
    expect(consoleAnnouncement(deriveConsoleView(teacherSnap({ counts: { ...COUNTS, answered: 29 } })))).toBe('Question 1 is open.');
    expect(consoleAnnouncement(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'revealed' }) })))).toBe('Question 1 revealed.');
  });
});

describe('reminderMessage', () => {
  const nothing = { recipients: 0, sent: 0, partial: 0, failed: 0, notConnected: 0, skipped: null };

  it('says what a reminder did, in plain words', () => {
    expect(reminderMessage({ ...nothing, skipped: 'no-bot' })).toBe('Reminders need the meeting bot, and it is not in this meeting.');
    expect(reminderMessage({ ...nothing, skipped: 'no-meeting' })).toBe('Reminders need the meeting bot, and it is not in this meeting.');
    expect(reminderMessage({ ...nothing, skipped: 'nobody-to-remind' })).toBe('Everyone has the pad open.');
    expect(reminderMessage({ ...nothing, skipped: 'nobody-to-remind', notConnected: 1 })).toBe(
      '1 student does not have the pad open, but Teams has not shown the bot who they are yet.',
    );
    expect(reminderMessage({ ...nothing, skipped: 'nobody-to-remind', notConnected: 4 })).toMatch(/^4 students do not/);
    expect(reminderMessage({ ...nothing, recipients: 3, sent: 2, partial: 1 })).toBe('Reminder sent to 3 students.');
    expect(reminderMessage({ ...nothing, recipients: 1, sent: 1 })).toBe('Reminder sent to 1 student.');
    expect(reminderMessage({ ...nothing, recipients: 4, failed: 4 })).toBe('The reminder could not be sent. Try again in a moment.');
  });
});

describe('a timed question on the student pad', () => {
  const seen = new Set(['p1']);
  const CLOSES = '2026-09-10T10:00:30Z';
  const before = Date.parse(CLOSES) - 5_000;
  const after = Date.parse(CLOSES) + 500;
  const timed = (overrides: Partial<StudentPrompt> = {}) => studentPrompt({ closes_at: CLOSES, time_limit_s: 30, ...overrides });

  it('knows when the time is up on the server clock, and never for an untimed question', () => {
    expect(isTimeUp(timed(), before)).toBe(false);
    expect(isTimeUp(timed(), Date.parse(CLOSES))).toBe(true);
    expect(isTimeUp(timed(), after)).toBe(true);
    expect(isTimeUp(studentPrompt(), after)).toBe(false);
    expect(isTimeUp(timed(), null)).toBe(false);
  });

  it('answers as usual while time is left', () => {
    expect(deriveStudentView(studentSnap({ prompt: timed() }), null, seen, before)).toMatchObject({ kind: 'answering', selected: null });
  });

  it('locks at 0 while the snapshot still says open, keeping the answer that stands', () => {
    const view = deriveStudentView(studentSnap({ prompt: timed(), my_response: mine('C') }), null, seen, after);
    expect(view).toMatchObject({ kind: 'locked', answer: 'C', timeUp: true });
    expect(studentAnnouncement(view)).toBe('Time is up. Your answer C is locked.');
  });

  it('says time is up for a student who did not answer, and not that they joined late', () => {
    const view = deriveStudentView(studentSnap({ prompt: timed() }), null, seen, after);
    expect(view).toMatchObject({ kind: 'missed', reason: 'time-up', revealed: false });
    expect(studentAnnouncement(view)).toBe('Time is up.');
    // Auto-closed by the server: the same words.
    expect(deriveStudentView(studentSnap({ prompt: timed({ state: 'closed', version: 2 }) }), null, seen, after)).toMatchObject({ reason: 'time-up' });
    expect(deriveStudentView(studentSnap({ prompt: timed({ state: 'closed', version: 2 }) }), null, new Set(), after)).toMatchObject({
      reason: 'joined-after-close',
    });
  });

  it('keeps a tap made before 0 on its way, over the answer the server holds', () => {
    expect(deriveStudentView(studentSnap({ prompt: timed(), my_response: mine('A') }), pending('retrying'), seen, after)).toMatchObject({
      kind: 'saving',
      answer: 'B',
      retrying: true,
    });
    expect(deriveStudentView(studentSnap({ prompt: timed() }), pending('sending'), seen, after)).toMatchObject({ kind: 'saving', answer: 'B' });
  });

  it('shows the answer that stands after a time-up refusal', () => {
    const refused: PendingSubmit = { promptId: 'p1', answer: 'D', status: 'refused', standing: 'A', timeUp: true, version: 1 };
    expect(deriveStudentView(studentSnap({ prompt: timed(), my_response: mine('A') }), refused, seen, before)).toMatchObject({
      kind: 'locked',
      answer: 'A',
      timeUp: true,
    });
    const noAnswer: PendingSubmit = { promptId: 'p1', answer: 'D', status: 'refused', standing: null, timeUp: true, version: 1 };
    expect(deriveStudentView(studentSnap({ prompt: timed({ state: 'closed', version: 2 }) }), noAnswer, seen, after)).toMatchObject({
      kind: 'missed',
      reason: 'time-up',
    });
  });

  it('opens again when the teacher adds time to a question whose time was up', () => {
    const refused: PendingSubmit = { promptId: 'p1', answer: 'D', status: 'refused', standing: 'A', timeUp: true, version: 2 };
    const reopened = studentSnap({ prompt: timed({ version: 3, closes_at: '2026-09-10T10:01:00Z' }), my_response: mine('A') });
    expect(deriveStudentView(reopened, refused, seen, after)).toMatchObject({ kind: 'answering', selected: 'A', save: 'saved' });
  });
});

describe('qbButtonTexts', () => {
  const option = (text: string | null, image_url: string | null = null) => ({ text, image_url });

  it('puts short plain option texts on the buttons', () => {
    expect(qbButtonTexts({ options: [option('Both correct'), option('Only I'), option(null, 'https://x/c.png'), option('None')] })).toEqual([
      'Both correct',
      'Only I',
      null,
      'None',
    ]);
  });

  it('leaves math and long texts for the question panel', () => {
    expect(qbButtonTexts({ options: [option('$x^2$'), option('a'.repeat(60)), option(String.raw`\frac{1}{2}`), option(null)] })).toBeNull();
    expect(qbButtonTexts({ options: [] })).toBeNull();
    expect(qbButtonTexts(null)).toBeNull();
  });
});

describe('effectiveKeys', () => {
  it("grades with the teacher's key, else the question bank's, and never a poll", () => {
    expect(effectiveKeys(teacherPrompt({ correct_keys: ['D'], suggested_keys: ['B'] }))).toEqual(['D']);
    expect(effectiveKeys(teacherPrompt({ correct_keys: null, suggested_keys: ['B'] }))).toEqual(['B']);
    expect(effectiveKeys(teacherPrompt({ ungraded: true, suggested_keys: ['B'] }))).toBeNull();
    expect(effectiveKeys(teacherPrompt())).toBeNull();
  });

  it("counts the bank's answer as decided, so Reveal is one tap", () => {
    expect(deriveConsoleView(teacherSnap({ prompt: teacherPrompt({ state: 'closed', suggested_keys: ['B'] }) }))).toMatchObject({
      kind: 'closed',
      decided: true,
    });
  });
});

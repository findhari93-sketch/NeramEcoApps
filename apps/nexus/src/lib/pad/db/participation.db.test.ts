// @vitest-environment node
/**
 * Answer Pad participation, presence, scoring, the session report, notification
 * targets and bot participant events (side-panel spec sections 5, 8 and 12;
 * v3.1 section 11 scoring). Every assertion runs the real migration SQL in PGlite.
 *
 * Most prompts are moved a few hours into the past once they finish, so presence
 * rows can be placed exactly around their open window. Presence written in real
 * time by submits then falls outside every moved window.
 */
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb, at, minutes, type ClassFixture, type Json } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

const SECOND = 1_000;
const HOUR = minutes(60);

interface Session extends ClassFixture {
  sessionId: string;
  meetingId: string;
  scheduledClassId: string;
}

interface ParticipationRow {
  student_id: string;
  on_roster: boolean;
  participation: 'answered' | 'silent' | 'absent';
  result: 'correct' | 'incorrect' | 'ungraded' | null;
  answer: string | null;
  joined_mid_prompt: boolean;
}

interface PromptWindow {
  openedAt: Date;
  closedAt: Date;
}

/** A two-minute prompt window starting three hours ago, shifted by some minutes. */
function pastWindow(offsetMinutes = 0): PromptWindow {
  const openedAt = new Date(Date.now() - 3 * HOUR + minutes(offsetMinutes));
  return { openedAt, closedAt: at(openedAt, minutes(2)) };
}

const iso = (d: Date): string => d.toISOString();
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

/** A live session bound to a Teams meeting and a scheduled class unless told otherwise. */
async function session(students = 3, opts: { meeting?: boolean; scheduledClass?: boolean } = {}): Promise<Session> {
  const fixture = await t.classWithStudents(students);
  const meetingId = `meeting-${randomUUID()}`;
  const scheduledClassId = await t.scheduledClass(fixture.classroomId, fixture.teacherId);
  const started = await t.start(fixture.teacherId, fixture.classroomId, {
    meetingId: opts.meeting === false ? undefined : meetingId,
    scheduledClassId: opts.scheduledClass === false ? undefined : scheduledClassId,
  });
  expect(started.ok).toBe(true);
  return { ...fixture, sessionId: started.session_id, meetingId, scheduledClassId };
}

interface PromptPlan {
  window: PromptWindow;
  type?: 'mcq' | 'numeric' | 'text' | 'yesno';
  answers?: Array<[string, string]>;
  key?: string[];
  poll?: boolean;
  /** false: stop after the key is set, leaving the prompt CLOSED. */
  reveal?: boolean;
  /** false: leave the prompt OPEN. */
  close?: boolean;
}

/** ASK, collect the answers, then CLOSE, set the key and REVEAL as planned, and move the window. */
async function runPrompt(s: Session, plan: PromptPlan): Promise<string> {
  const type = plan.type ?? 'mcq';
  const asked = await t.ask(s.teacherId, s.sessionId, type, type === 'mcq' ? 4 : null);
  expect(asked).toMatchObject({ ok: true, changed: true });
  const promptId: string = asked.prompt_id;

  for (const [student, raw] of plan.answers ?? []) {
    expect(await t.submit(student, promptId, raw)).toMatchObject({ ok: true, status: 'accepted' });
  }

  if (plan.close === false) {
    await t.shiftPromptWindow(promptId, plan.window.openedAt, null);
    return promptId;
  }

  expect((await t.close(s.teacherId, promptId)).ok).toBe(true);
  if (plan.poll) {
    expect((await t.setKey(s.teacherId, promptId, null, true)).ok).toBe(true);
  } else if (plan.key) {
    expect((await t.setKey(s.teacherId, promptId, plan.key)).ok).toBe(true);
  }
  if ((plan.poll || plan.key) && plan.reveal !== false) {
    expect((await t.reveal(s.teacherId, promptId)).ok).toBe(true);
  }
  await t.shiftPromptWindow(promptId, plan.window.openedAt, plan.window.closedAt);
  return promptId;
}

async function participationRows(s: Session, promptId: string, roster: readonly string[] = s.students): Promise<ParticipationRow[]> {
  const result = await t.participation(s.teacherId, promptId, roster);
  expect(result.ok).toBe(true);
  return result.rows;
}

function rowOf(rows: ParticipationRow[], studentId: string): ParticipationRow {
  const matches = rows.filter((r) => r.student_id === studentId);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('participation: exactly one row per student', () => {
  it('returns one row per roster student despite duplicate and overlapping presence from every source', async () => {
    const s = await session(3);
    const [answered, silent, absent] = s.students;
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, answers: [[answered, 'a']], key: ['A'] });

    await t.appPresence(s.sessionId, silent, at(w.openedAt, -minutes(5)), at(w.openedAt, minutes(1)));
    await t.appPresence(s.sessionId, silent, at(w.openedAt, -minutes(4)), at(w.openedAt, minutes(1)));
    await t.appPresence(s.sessionId, silent, at(w.openedAt, 30 * SECOND), at(w.openedAt, minutes(3)));
    await t.meetingPresence(s.meetingId, silent, at(w.openedAt, -minutes(10)), null);
    await t.meetingPresence(s.meetingId, silent, at(w.openedAt, -minutes(9)), at(w.openedAt, minutes(20)));
    await t.attendance(s.scheduledClassId, silent, [
      { joinDateTime: iso(at(w.openedAt, -minutes(10))), leaveDateTime: iso(at(w.openedAt, minutes(30))) },
      { joinDateTime: iso(at(w.openedAt, -minutes(8))), leaveDateTime: iso(at(w.openedAt, minutes(31))) },
    ]);
    await t.appPresence(s.sessionId, answered, at(w.openedAt, -minutes(1)), at(w.openedAt, minutes(1)));
    await t.meetingPresence(s.meetingId, answered, at(w.openedAt, -minutes(2)), null);

    // The roster repeats ids, as a careless caller might pass it.
    const rows = await participationRows(s, promptId, [answered, silent, absent, silent, answered]);
    expect(rows).toHaveLength(3);
    expect(rowOf(rows, answered)).toMatchObject({ on_roster: true, participation: 'answered', result: 'correct', answer: 'A' });
    expect(rowOf(rows, silent)).toMatchObject({ on_roster: true, participation: 'silent', result: null, answer: null });
    expect(rowOf(rows, absent)).toMatchObject({ on_roster: true, participation: 'absent', result: null, answer: null });
  });

  it('ignores null roster ids, and lists an answer from someone off the roster exactly once', async () => {
    const s = await session(2);
    const [offRoster, listed] = s.students;
    const promptId = await runPrompt(s, { window: pastWindow(), answers: [[offRoster, 'B']], key: ['A'] });

    const withNull = await participationRows(s, promptId, [listed, 'NULL']);
    expect(withNull.map((r) => r.student_id).sort()).toEqual([offRoster, listed].sort());
    expect(rowOf(withNull, offRoster)).toMatchObject({ on_roster: false, participation: 'answered', result: 'incorrect' });
    expect(rowOf(withNull, listed)).toMatchObject({ on_roster: true, participation: 'absent' });

    const empty = await participationRows(s, promptId, []);
    expect(empty).toEqual([expect.objectContaining({ student_id: offRoster, on_roster: false, participation: 'answered' })]);
  });

  it('gives a result only to answers: ungraded until Reveal, then correct or incorrect, and ungraded for a poll', async () => {
    const s = await session(3);
    const [right, wrong, silentStudent] = s.students;
    const graded = await runPrompt(s, { window: pastWindow(0), answers: [[right, 'c'], [wrong, 'D']], key: ['C'], reveal: false });

    let rows = await participationRows(s, graded);
    expect(rowOf(rows, right).result).toBe('ungraded');
    expect(rowOf(rows, wrong).result).toBe('ungraded');

    expect((await t.reveal(s.teacherId, graded)).ok).toBe(true);
    rows = await participationRows(s, graded);
    expect(rowOf(rows, right)).toMatchObject({ result: 'correct', answer: 'C' });
    expect(rowOf(rows, wrong)).toMatchObject({ result: 'incorrect', answer: 'D' });
    expect(rowOf(rows, silentStudent)).toMatchObject({ result: null, answer: null });

    const poll = await runPrompt(s, { window: pastWindow(10), answers: [[right, 'A']], poll: true });
    rows = await participationRows(s, poll);
    expect(rowOf(rows, right)).toMatchObject({ participation: 'answered', result: 'ungraded', answer: 'A' });
  });

  it('refuses the named list while the prompt is OPEN, and to anyone but the session teacher', async () => {
    const s = await session(2);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    await t.submit(s.students[0], asked.prompt_id, 'A');
    expect(await t.participation(s.teacherId, asked.prompt_id, s.students)).toEqual({ ok: false, code: 'PROMPT_OPEN' });

    const otherTeacher = await t.user('teacher');
    const admin = await t.user('admin');
    for (const actor of [otherTeacher, admin, s.students[0], null]) {
      expect(await t.participation(actor, asked.prompt_id, s.students)).toEqual({ ok: false, code: 'NOT_SESSION_TEACHER' });
    }
    expect(await t.participation(s.teacherId, randomUUID(), s.students)).toEqual({ ok: false, code: 'NOT_FOUND' });

    await t.close(s.teacherId, asked.prompt_id);
    expect((await t.participation(s.teacherId, asked.prompt_id, s.students)).ok).toBe(true);
  });
});

describe('participation: presence inside the prompt window', () => {
  it('counts app presence until 90 seconds after the last heartbeat and up to the moment of Close', async () => {
    const s = await session(5);
    const [goneJustBefore, graceCovers, joinsAtClose, joinsAfterClose, briefDuring] = s.students;
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });

    await t.appPresence(s.sessionId, goneJustBefore, at(w.openedAt, -minutes(5)), at(w.openedAt, -91 * SECOND));
    await t.appPresence(s.sessionId, graceCovers, at(w.openedAt, -minutes(5)), at(w.openedAt, -89 * SECOND));
    await t.appPresence(s.sessionId, joinsAtClose, w.closedAt, w.closedAt);
    await t.appPresence(s.sessionId, joinsAfterClose, at(w.closedAt, SECOND), at(w.closedAt, minutes(5)));
    await t.appPresence(s.sessionId, briefDuring, at(w.openedAt, 10 * SECOND), at(w.openedAt, 20 * SECOND));

    const rows = await participationRows(s, promptId);
    expect(rowOf(rows, goneJustBefore).participation).toBe('absent');
    expect(rowOf(rows, graceCovers).participation).toBe('silent');
    expect(rowOf(rows, joinsAtClose).participation).toBe('silent');
    expect(rowOf(rows, joinsAfterClose).participation).toBe('absent');
    expect(rowOf(rows, briefDuring).participation).toBe('silent');
  });

  it('ignores app presence recorded for another session of the same classroom', async () => {
    const s = await session(1);
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });

    const coTeacher = await t.user('teacher');
    const other = await t.start(coTeacher, s.classroomId);
    expect(other.ok).toBe(true);
    await t.appPresence(other.session_id, s.students[0], at(w.openedAt, -minutes(1)), w.closedAt);

    expect(rowOf(await participationRows(s, promptId), s.students[0]).participation).toBe('absent');
  });

  it('counts a bot meeting interval that overlaps the window, capping one with no leave at 12 hours', async () => {
    const s = await session(6);
    const [leftBefore, leftAtOpen, openRecent, openStale, otherMeeting, rejoined] = s.students;
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });

    await t.meetingPresence(s.meetingId, leftBefore, at(w.openedAt, -minutes(30)), at(w.openedAt, -SECOND));
    await t.meetingPresence(s.meetingId, leftAtOpen, at(w.openedAt, -minutes(30)), w.openedAt);
    await t.meetingPresence(s.meetingId, openRecent, at(w.openedAt, -11 * HOUR), null);
    await t.meetingPresence(s.meetingId, openStale, at(w.openedAt, -13 * HOUR), null);
    await t.meetingPresence(`meeting-${randomUUID()}`, otherMeeting, at(w.openedAt, -minutes(5)), null);
    await t.meetingPresence(s.meetingId, rejoined, at(w.openedAt, -minutes(30)), at(w.openedAt, -minutes(20)));
    await t.meetingPresence(s.meetingId, rejoined, at(w.openedAt, minutes(1)), at(w.openedAt, minutes(10)));

    const rows = await participationRows(s, promptId);
    expect(rowOf(rows, leftBefore).participation).toBe('absent');
    expect(rowOf(rows, leftAtOpen).participation).toBe('silent');
    expect(rowOf(rows, openRecent).participation).toBe('silent');
    expect(rowOf(rows, openStale).participation).toBe('absent');
    expect(rowOf(rows, otherMeeting).participation).toBe('absent');
    expect(rowOf(rows, rejoined).participation).toBe('silent');
  });

  it('ignores meeting presence for a browser session that has no meeting', async () => {
    const s = await session(1, { meeting: false });
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });
    await t.meetingPresence(s.meetingId, s.students[0], at(w.openedAt, -minutes(5)), null);

    expect(rowOf(await participationRows(s, promptId), s.students[0]).participation).toBe('absent');
  });

  it('counts Teams attendance-report intervals for the scheduled class and survives malformed data', async () => {
    const s = await session(9);
    const [inside, noLeaveRecent, badLeaveStale, notArray, stringValue, jsonNull, wordDates, notObjects, otherClass] = s.students;
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });

    await t.attendance(s.scheduledClassId, inside, [
      { joinDateTime: iso(at(w.openedAt, -minutes(40))), leaveDateTime: iso(at(w.openedAt, -minutes(20))) },
      { joinDateTime: iso(at(w.openedAt, minutes(1))), leaveDateTime: iso(at(w.openedAt, minutes(50))) },
    ]);
    await t.attendance(s.scheduledClassId, noLeaveRecent, [{ joinDateTime: iso(at(w.openedAt, -HOUR)) }]);
    await t.attendance(s.scheduledClassId, badLeaveStale, [{ joinDateTime: iso(at(w.openedAt, -13 * HOUR)), leaveDateTime: 'not a date' }]);
    await t.attendance(s.scheduledClassId, notArray, { joinDateTime: iso(at(w.openedAt, -minutes(5))) });
    await t.attendance(s.scheduledClassId, stringValue, 'present');
    await t.attendance(s.scheduledClassId, jsonNull, null);
    // Postgres itself would read these words as real dates spanning the window.
    await t.attendance(s.scheduledClassId, wordDates, [{ joinDateTime: 'yesterday', leaveDateTime: 'tomorrow' }, { leaveDateTime: iso(w.closedAt) }]);
    await t.attendance(s.scheduledClassId, notObjects, [42, 'x', null, []]);
    const otherClassId = await t.scheduledClass(s.classroomId, s.teacherId);
    await t.attendance(otherClassId, otherClass, [{ joinDateTime: iso(at(w.openedAt, -minutes(5))), leaveDateTime: iso(w.closedAt) }]);

    const rows = await participationRows(s, promptId);
    expect(rowOf(rows, inside).participation).toBe('silent');
    expect(rowOf(rows, noLeaveRecent).participation).toBe('silent');
    expect(rowOf(rows, badLeaveStale).participation).toBe('absent');
    for (const student of [notArray, stringValue, jsonNull, wordDates, notObjects, otherClass]) {
      expect({ student, participation: rowOf(rows, student).participation }).toEqual({ student, participation: 'absent' });
    }
  });
});

describe('participation: joined mid-prompt', () => {
  it('marks only students first seen while the prompt was open', async () => {
    const s = await session(6);
    const [beforeOpen, midApp, midMeeting, inMeetingBeforeOpen, afterClose, never] = s.students;
    const w = pastWindow();
    const promptId = await runPrompt(s, { window: w, key: ['A'] });

    await t.appPresence(s.sessionId, beforeOpen, at(w.openedAt, -minutes(5)), at(w.openedAt, minutes(1)));
    await t.appPresence(s.sessionId, midApp, at(w.openedAt, 30 * SECOND), at(w.openedAt, 90 * SECOND));
    await t.meetingPresence(s.meetingId, midMeeting, at(w.openedAt, minutes(1)), null);
    await t.meetingPresence(s.meetingId, inMeetingBeforeOpen, at(w.openedAt, -minutes(30)), null);
    await t.appPresence(s.sessionId, inMeetingBeforeOpen, at(w.openedAt, 30 * SECOND), at(w.openedAt, minutes(1)));
    await t.appPresence(s.sessionId, afterClose, at(w.closedAt, minutes(3)), at(w.closedAt, minutes(4)));

    const rows = await participationRows(s, promptId);
    expect(rowOf(rows, beforeOpen)).toMatchObject({ participation: 'silent', joined_mid_prompt: false });
    expect(rowOf(rows, midApp)).toMatchObject({ participation: 'silent', joined_mid_prompt: true });
    expect(rowOf(rows, midMeeting)).toMatchObject({ participation: 'silent', joined_mid_prompt: true });
    expect(rowOf(rows, inMeetingBeforeOpen)).toMatchObject({ participation: 'silent', joined_mid_prompt: false });
    expect(rowOf(rows, afterClose)).toMatchObject({ participation: 'absent', joined_mid_prompt: false });
    expect(rowOf(rows, never)).toMatchObject({ participation: 'absent', joined_mid_prompt: false });
  });

  it('marks a late joiner who answers in real time, and not the student already waiting before ASK', async () => {
    const s = await session(2);
    const [waiting, late] = s.students;
    expect(await t.joinByMeeting(waiting, s.meetingId)).toEqual({ ok: true, session_id: s.sessionId });
    await tick();
    const asked = await t.ask(s.teacherId, s.sessionId, 'yesno', null);
    await tick();
    expect(await t.joinByMeeting(late, s.meetingId)).toEqual({ ok: true, session_id: s.sessionId });
    await t.submit(late, asked.prompt_id, 'Y');
    await t.close(s.teacherId, asked.prompt_id);

    const rows = await participationRows(s, asked.prompt_id);
    expect(rowOf(rows, waiting)).toMatchObject({ participation: 'silent', joined_mid_prompt: false });
    expect(rowOf(rows, late)).toMatchObject({ participation: 'answered', answer: 'yes', joined_mid_prompt: true });
  });
});

describe('teacher snapshot', () => {
  it('starts with no prompt, no counts and an empty history', async () => {
    const s = await session(2);
    const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap).toMatchObject({ ok: true, role: 'teacher', prompt: null, counts: null, groups: [], history: [] });
    expect(snap.session).toMatchObject({
      id: s.sessionId,
      status: 'live',
      meeting_id: s.meetingId,
      scheduled_class_id: s.scheduledClassId,
      presence_basis: 'app',
      bot_in_meeting: false,
    });
    expect(snap.session.room_code).toMatch(/^\d{6}$/);
    expect(snap.readiness).toEqual({ enrolled: 2, connected: 0, in_meeting: 0 });
  });

  it('shows a live count but no distribution while OPEN, and groups by normalised answer after CLOSE', async () => {
    const s = await session(4);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    await t.submit(s.students[0], asked.prompt_id, 'a');
    await t.submit(s.students[1], asked.prompt_id, ' A ');
    await t.submit(s.students[2], asked.prompt_id, 'c');

    const open = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(open.prompt).toMatchObject({ id: asked.prompt_id, state: 'open', answered_count: 3, correct_keys: null });
    expect(open.groups).toEqual([]);
    expect(open.counts).toMatchObject({ enrolled: 4, answered: 3, correct: 0, incorrect: 0 });

    await t.close(s.teacherId, asked.prompt_id);
    const closed = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(closed.groups).toEqual([
      { value: 'A', count: 2 },
      { value: 'C', count: 1 },
    ]);
    expect(closed.counts.answered + closed.counts.silent + closed.counts.absent).toBe(closed.counts.enrolled);
  });

  it('counts readiness from roster students only: pad seen within 90 seconds, in the meeting in the last 12 hours', async () => {
    const s = await session(3);
    const [connected, stale, staleOpenInterval] = s.students;
    const outsider = await t.user('student');
    await t.enroll(outsider, s.classroomId, { participation: 'dormant' });
    const now = Date.now();

    await t.appPresence(s.sessionId, connected, new Date(now - minutes(2)), new Date(now - 10 * SECOND));
    await t.appPresence(s.sessionId, connected, new Date(now - minutes(1)), new Date(now - 5 * SECOND));
    await t.appPresence(s.sessionId, stale, new Date(now - minutes(10)), new Date(now - minutes(3)));
    await t.appPresence(s.sessionId, outsider, new Date(now - minutes(1)), new Date(now - 5 * SECOND));
    await t.meetingPresence(s.meetingId, connected, new Date(now - minutes(5)), null);
    await t.meetingPresence(s.meetingId, connected, new Date(now - minutes(4)), null);
    await t.meetingPresence(s.meetingId, stale, new Date(now - minutes(20)), new Date(now - minutes(1)));
    await t.meetingPresence(s.meetingId, staleOpenInterval, new Date(now - 13 * HOUR), null);
    await t.meetingPresence(s.meetingId, outsider, new Date(now - minutes(5)), null);

    const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, [...s.students, connected]);
    expect(snap.readiness).toEqual({ enrolled: 3, connected: 1, in_meeting: 1 });
  });

  it('reports presence_basis "meeting" once meeting presence or attendance intervals exist, otherwise "app"', async () => {
    const byAttendance = await session(2, { meeting: false });
    const attendanceBasis = async () =>
      (await t.teacherSnapshot(byAttendance.teacherId, byAttendance.sessionId, byAttendance.students)).session.presence_basis;
    expect(await attendanceBasis()).toBe('app');
    await t.attendance(byAttendance.scheduledClassId, byAttendance.students[0], []);
    expect(await attendanceBasis()).toBe('app');
    await t.attendance(byAttendance.scheduledClassId, byAttendance.students[1], [{ joinDateTime: iso(new Date()), leaveDateTime: iso(new Date()) }]);
    expect(await attendanceBasis()).toBe('meeting');

    const byBot = await session(1, { scheduledClass: false });
    const botBasis = async () => (await t.teacherSnapshot(byBot.teacherId, byBot.sessionId, byBot.students)).session.presence_basis;
    expect(await botBasis()).toBe('app');
    await t.meetingPresence(`meeting-${randomUUID()}`, byBot.students[0], new Date(), null);
    expect(await botBasis()).toBe('app');
    await t.meetingPresence(byBot.meetingId, byBot.students[0], new Date(), null);
    expect(await botBasis()).toBe('meeting');
  });

  it('reports the bot in the meeting only when a conversation is stored for this meeting', async () => {
    const s = await session(1);
    const botInMeeting = async () => (await t.teacherSnapshot(s.teacherId, s.sessionId, s.students)).session.bot_in_meeting;
    expect(await botInMeeting()).toBe(false);
    await t.botConversation(`19:${randomUUID()}@thread.v2`, 'https://smba.trafficmanager.net/in/', `meeting-${randomUUID()}`);
    expect(await botInMeeting()).toBe(false);
    await t.botConversation(`19:${randomUUID()}@thread.v2`, 'https://smba.trafficmanager.net/in/', s.meetingId);
    expect(await botInMeeting()).toBe(true);
  });

  it('lists every prompt in order with its label, answered and correct counts', async () => {
    const s = await session(3);
    const first = await runPrompt(s, { window: pastWindow(), answers: [[s.students[0], 'A'], [s.students[1], 'B']], key: ['A'] });
    expect((await t.label(s.teacherId, first, 'Kinematics')).ok).toBe(true);
    const second = await t.ask(s.teacherId, s.sessionId, 'numeric', null);

    const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.history).toEqual([
      expect.objectContaining({ id: first, sequence: 1, state: 'revealed', label: 'Kinematics', answered: 2, correct: 1, ungraded: false }),
      expect.objectContaining({ id: second.prompt_id, sequence: 2, state: 'open', answer_type: 'numeric', answered: 0, correct: 0 }),
    ]);
    expect(snap.prompt.id).toBe(second.prompt_id);
  });

  it('refuses anyone but the session teacher', async () => {
    const s = await session(1);
    const otherTeacher = await t.user('teacher');
    const admin = await t.user('admin');
    for (const actor of [otherTeacher, admin, s.students[0], null]) {
      expect(await t.teacherSnapshot(actor, s.sessionId, s.students)).toEqual({ ok: false, code: 'NOT_SESSION_TEACHER' });
    }
    expect(await t.teacherSnapshot(s.teacherId, randomUUID(), s.students)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('scoring (v3.1 section 11)', () => {
  it('scores a worked example: correct, wrong and skipped count; absent, polls and unrevealed prompts do not', async () => {
    const s = await session(4);
    const [s1, s2, s3, s4] = s.students;
    const q1 = pastWindow(0);
    const q3 = pastWindow(20);

    // s1 and s2 have no presence rows inside any window: an answer is proof of presence.
    await runPrompt(s, { window: q1, answers: [[s1, 'A'], [s2, 'B']], key: ['A'] });
    await t.appPresence(s.sessionId, s3, at(q1.openedAt, -minutes(1)), at(q1.openedAt, minutes(1))); // Q1: s3 skipped, s4 absent
    await runPrompt(s, { window: pastWindow(10), answers: [[s1, 'C'], [s2, 'C']], poll: true });
    await runPrompt(s, { window: q3, answers: [[s1, 'A'], [s2, 'B']], key: ['B'] });
    await t.meetingPresence(s.meetingId, s4, at(q3.openedAt, -minutes(1)), at(q3.closedAt, minutes(1))); // Q3: s4 skipped, s3 absent
    await runPrompt(s, { window: pastWindow(30), answers: [[s1, 'D'], [s3, 'D']], key: ['D'], reveal: false });

    const expected: Record<string, { correct: number; wrong: number; skipped: number; absent: number; total_graded: number }> = {
      [s1]: { correct: 1, wrong: 1, skipped: 0, absent: 0, total_graded: 2 },
      [s2]: { correct: 1, wrong: 1, skipped: 0, absent: 0, total_graded: 2 },
      [s3]: { correct: 0, wrong: 0, skipped: 1, absent: 1, total_graded: 1 },
      [s4]: { correct: 0, wrong: 0, skipped: 1, absent: 1, total_graded: 1 },
    };

    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.ok).toBe(true);
    for (const student of s.students) {
      const pad = await t.studentSnapshot(student, s.sessionId);
      expect(pad.score).toEqual(expected[student]);
      expect(pad.score.correct + pad.score.wrong + pad.score.skipped).toBe(pad.score.total_graded);

      const { absent: _notReported, ...scored } = expected[student];
      expect(report.students.find((r: Json) => r.student_id === student)).toMatchObject(scored);
    }
  });

  it('gives total_graded 0 until a graded prompt is revealed, whatever polls and closed prompts exist', async () => {
    const s = await session(1);
    const [student] = s.students;
    await runPrompt(s, { window: pastWindow(0), answers: [[student, 'A']], poll: true });
    await runPrompt(s, { window: pastWindow(10), answers: [[student, 'A']], key: ['A'], reveal: false });

    const pad = await t.studentSnapshot(student, s.sessionId);
    expect(pad.score).toEqual({ correct: 0, wrong: 0, skipped: 0, absent: 0, total_graded: 0 });
  });
});

describe('scoring and participation agree with an independent model', () => {
  type Outcome = 'correct' | 'wrong' | 'silent' | 'absent';
  type Kind = 'graded' | 'poll' | 'unrevealed' | 'open';

  /** Deterministic, so a failing seed can be replayed. */
  function prng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function pick<T>(rand: () => number, items: readonly T[]): T {
    return items[Math.floor(rand() * items.length)];
  }

  const isAnswer = (o: Outcome): boolean => o === 'correct' || o === 'wrong';

  it.each([7, 42, 2026, 90210])('seed %i', async (seed) => {
    const rand = prng(seed);
    const s = await session(8);
    const dormant = await t.user('student', { name: 'Dormant student' });
    await t.enroll(dormant, s.classroomId, { participation: 'dormant' });
    const roster = s.students;
    const people = [...roster, dormant];
    const dormantIndex = people.length - 1;

    const kinds: Kind[] = [
      'graded',
      pick(rand, ['graded', 'poll'] as const),
      pick(rand, ['graded', 'poll'] as const),
      pick(rand, ['graded', 'poll'] as const),
      pick(rand, ['graded', 'poll', 'unrevealed', 'open'] as const),
    ];
    const outcomes: Outcome[][] = kinds.map(() => people.map(() => pick(rand, ['correct', 'wrong', 'silent', 'absent'] as const)));
    const attendance = new Map<string, Array<{ joinDateTime: string; leaveDateTime: string }>>();
    const promptIds: string[] = [];

    for (const [j, kind] of kinds.entries()) {
      const w = pastWindow(10 * j);
      const answers = people.flatMap((person, i): Array<[string, string]> => {
        if (outcomes[j][i] === 'correct') return [[person, 'A']];
        if (outcomes[j][i] === 'wrong') return [[person, 'B']];
        return [];
      });
      promptIds.push(
        await runPrompt(s, {
          window: w,
          answers,
          key: kind === 'graded' || kind === 'unrevealed' ? ['A'] : undefined,
          poll: kind === 'poll',
          reveal: kind !== 'unrevealed',
          close: kind !== 'open',
        }),
      );

      // Silent students are seen by exactly one source, chosen at random, inside this window only.
      for (const [i, person] of people.entries()) {
        if (outcomes[j][i] !== 'silent') continue;
        const source = pick(rand, ['app', 'meeting', 'attendance'] as const);
        if (source === 'app') {
          await t.appPresence(s.sessionId, person, at(w.openedAt, 20 * SECOND), at(w.openedAt, 40 * SECOND));
        } else if (source === 'meeting') {
          await t.meetingPresence(s.meetingId, person, at(w.openedAt, -minutes(1)), at(w.openedAt, minutes(1)));
        } else {
          const intervals = attendance.get(person) ?? [];
          intervals.push({ joinDateTime: iso(at(w.openedAt, 30 * SECOND)), leaveDateTime: iso(at(w.openedAt, minutes(1))) });
          attendance.set(person, intervals);
        }
      }
    }
    for (const [person, intervals] of attendance) {
      await t.attendance(s.scheduledClassId, person, intervals);
    }

    const scored = (j: number): boolean => kinds[j] === 'graded';
    const counted = (j: number): boolean => kinds[j] !== 'open';
    const expectedScore = (i: number) => {
      const score = { correct: 0, wrong: 0, skipped: 0, absent: 0, total_graded: 0 };
      kinds.forEach((_, j) => {
        if (!scored(j)) return;
        const o = outcomes[j][i];
        if (o === 'correct') score.correct += 1;
        else if (o === 'wrong') score.wrong += 1;
        else if (o === 'silent') score.skipped += 1;
        else score.absent += 1;
      });
      score.total_graded = score.correct + score.wrong + score.skipped;
      return score;
    };

    // 1. The running score on every student's own pad.
    for (const [i, person] of people.entries()) {
      const pad = await t.studentSnapshot(person, s.sessionId);
      expect({ seed, student: i, score: pad.score }).toEqual({ seed, student: i, score: expectedScore(i) });
    }

    // 2. The report: every roster student, plus the dormant student once they have answered anything.
    const report = await t.report(s.teacherId, s.sessionId, roster);
    expect(report.ok).toBe(true);
    const dormantAnswered = kinds.some((_, j) => isAnswer(outcomes[j][dormantIndex]));
    expect(report.students).toHaveLength(roster.length + (dormantAnswered ? 1 : 0));

    for (const [i, person] of people.entries()) {
      const row = report.students.find((r: Json) => r.student_id === person);
      if (i === dormantIndex && !dormantAnswered) {
        expect(row).toBeUndefined();
        continue;
      }
      const participation = { answered: 0, silent: 0, absent: 0 };
      kinds.forEach((_, j) => {
        if (!counted(j)) return;
        const o = outcomes[j][i];
        if (o === 'correct' || o === 'wrong') participation.answered += 1;
        else participation[o] += 1;
      });
      const score = expectedScore(i);
      expect({ seed, student: i, row }).toEqual({
        seed,
        student: i,
        row: {
          student_id: person,
          name: expect.any(String),
          on_roster: i !== dormantIndex,
          ...participation,
          correct: score.correct,
          wrong: score.wrong,
          skipped: score.skipped,
          total_graded: score.total_graded,
        },
      });
    }

    // 3. Every prompt: counts that sum to the roster, and one named row per roster student.
    for (const [j, promptId] of promptIds.entries()) {
      const reported = report.prompts.find((p: Json) => p.id === promptId);
      if (!counted(j)) {
        expect(reported.counts).toBeNull();
        expect((await t.participation(s.teacherId, promptId, roster)).code).toBe('PROMPT_OPEN');
        continue;
      }
      const onRoster = outcomes[j].slice(0, roster.length);
      const expectedCounts = {
        enrolled: roster.length,
        answered: onRoster.filter(isAnswer).length,
        silent: onRoster.filter((o) => o === 'silent').length,
        absent: onRoster.filter((o) => o === 'absent').length,
        correct: scored(j) ? onRoster.filter((o) => o === 'correct').length : 0,
        incorrect: scored(j) ? onRoster.filter((o) => o === 'wrong').length : 0,
        answered_off_roster: isAnswer(outcomes[j][dormantIndex]) ? 1 : 0,
      };
      expect({ seed, prompt: j, counts: reported.counts }).toEqual({ seed, prompt: j, counts: expectedCounts });
      expect(expectedCounts.answered + expectedCounts.silent + expectedCounts.absent).toBe(expectedCounts.enrolled);

      const detail = await participationRows(s, promptId, roster);
      expect(detail).toHaveLength(roster.length + expectedCounts.answered_off_roster);
      for (const [i, person] of roster.entries()) {
        const o = outcomes[j][i];
        expect({ seed, prompt: j, student: i, participation: rowOf(detail, person).participation }).toEqual({
          seed,
          prompt: j,
          student: i,
          participation: isAnswer(o) ? 'answered' : o,
        });
      }
    }

    // 4. The live console agrees with the report about the newest prompt.
    const last = promptIds.length - 1;
    if (counted(last)) {
      const snap = await t.teacherSnapshot(s.teacherId, s.sessionId, roster);
      expect(snap.counts).toEqual(report.prompts[last].counts);
    }
  });
});

describe('session report', () => {
  it('lists every roster student by name, with zeros before any prompt', async () => {
    const s = await session(3);
    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report).toMatchObject({ ok: true, prompts: [] });
    expect(report.session).toMatchObject({ id: s.sessionId, status: 'live', enrolled: 3 });
    expect(report.students.map((r: Json) => r.name)).toEqual(['Student 1', 'Student 2', 'Student 3']);
    for (const row of report.students) {
      expect(row).toMatchObject({ on_roster: true, answered: 0, silent: 0, absent: 0, correct: 0, wrong: 0, skipped: 0, total_graded: 0 });
    }
  });

  it('leaves an OPEN prompt out until it closes', async () => {
    const s = await session(2);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    await t.submit(s.students[0], asked.prompt_id, 'A');

    let report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.prompts).toEqual([expect.objectContaining({ id: asked.prompt_id, state: 'open', counts: null })]);
    for (const row of report.students) {
      expect(row).toMatchObject({ answered: 0, silent: 0, absent: 0 });
    }

    await t.close(s.teacherId, asked.prompt_id);
    report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.prompts[0].counts).toMatchObject({ enrolled: 2, answered: 1 });
    expect(report.students.find((r: Json) => r.student_id === s.students[0]).answered).toBe(1);
  });

  it('stays available after the session ends, counting the prompt that ending closed', async () => {
    const s = await session(2);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    await t.submit(s.students[0], asked.prompt_id, 'B');
    expect(await t.end(s.teacherId, s.sessionId, true)).toMatchObject({ ok: true, changed: true });

    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.session.status).toBe('ended');
    expect(report.session.ended_at).not.toBeNull();
    expect(report.prompts[0]).toMatchObject({ state: 'closed', counts: expect.objectContaining({ answered: 1 }) });
  });

  it('keeps a dormant student who answered on the report, off the roster, with the same score as their pad', async () => {
    const s = await session(2);
    const dormant = await t.user('student', { name: 'Dormant Student' });
    await t.enroll(dormant, s.classroomId, { participation: 'dormant' });
    const q2 = pastWindow(10);
    await runPrompt(s, { window: pastWindow(0), answers: [[dormant, 'A']], key: ['A'] });
    await runPrompt(s, { window: q2, key: ['A'] });
    await t.appPresence(s.sessionId, dormant, at(q2.openedAt, -minutes(1)), at(q2.openedAt, minutes(1)));

    const pad = await t.studentSnapshot(dormant, s.sessionId);
    expect(pad.score).toEqual({ correct: 1, wrong: 0, skipped: 1, absent: 0, total_graded: 2 });

    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.session.enrolled).toBe(2);
    expect(report.students.find((r: Json) => r.student_id === dormant)).toMatchObject({
      name: 'Dormant Student',
      on_roster: false,
      answered: 1,
      silent: 1,
      correct: 1,
      wrong: 0,
      skipped: 1,
      total_graded: 2,
    });
    expect(report.prompts[0].counts).toMatchObject({ enrolled: 2, answered_off_roster: 1 });
    expect(report.prompts[1].counts).toMatchObject({ enrolled: 2, answered_off_roster: 0 });
  });

  it('refuses anyone but the session teacher', async () => {
    const s = await session(1);
    const otherTeacher = await t.user('teacher');
    for (const actor of [otherTeacher, s.students[0], null]) {
      expect(await t.report(actor, s.sessionId, s.students)).toEqual({ ok: false, code: 'NOT_SESSION_TEACHER' });
    }
    expect(await t.report(s.teacherId, randomUUID(), s.students)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('notification targets', () => {
  it('targets roster students not connected to the pad while meeting presence is unknown', async () => {
    const s = await session(4);
    const [connected, stale, neverOpened] = s.students;
    const dormant = await t.user('student');
    await t.enroll(dormant, s.classroomId, { participation: 'dormant' });
    const now = Date.now();
    await t.appPresence(s.sessionId, connected, new Date(now - minutes(1)), new Date(now - 10 * SECOND));
    await t.appPresence(s.sessionId, stale, new Date(now - minutes(10)), new Date(now - minutes(3)));
    await t.teamsUser(connected, '29:connected');
    await t.teamsUser(stale, '29:stale');
    await t.teamsUser(neverOpened, '29:never');
    await t.teamsUser(dormant, '29:dormant');

    // The fourth student has no Teams id yet: counted as not connected, but cannot be addressed.
    const targets = await t.notificationTargets(s.teacherId, s.sessionId, s.students);
    expect(targets).toMatchObject({ ok: true, meeting_presence_known: false, not_connected: 3 });
    expect([...targets.recipients].sort()).toEqual(['29:never', '29:stale']);
  });

  it('targets only students the bot sees in the meeting once meeting presence is known', async () => {
    const s = await session(4);
    const [inMeetingConnected, inMeeting, leftMeeting] = s.students;
    const now = Date.now();
    await t.meetingPresence(s.meetingId, inMeetingConnected, new Date(now - minutes(5)), null);
    await t.appPresence(s.sessionId, inMeetingConnected, new Date(now - minutes(1)), new Date(now - 5 * SECOND));
    await t.meetingPresence(s.meetingId, inMeeting, new Date(now - minutes(5)), null);
    await t.meetingPresence(s.meetingId, leftMeeting, new Date(now - minutes(5)), new Date(now - minutes(1)));
    for (const student of s.students) await t.teamsUser(student, `29:${student}`);

    expect(await t.notificationTargets(s.teacherId, s.sessionId, s.students)).toEqual({
      ok: true,
      meeting_presence_known: true,
      not_connected: 1,
      recipients: [`29:${inMeeting}`],
    });
  });

  it('refuses anyone but the session teacher', async () => {
    const s = await session(1);
    const otherTeacher = await t.user('teacher');
    for (const actor of [otherTeacher, s.students[0], null]) {
      expect(await t.notificationTargets(actor, s.sessionId, s.students)).toEqual({ ok: false, code: 'NOT_SESSION_TEACHER' });
    }
    expect(await t.notificationTargets(s.teacherId, randomUUID(), s.students)).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('bot', () => {
  const SERVICE_URL = 'https://smba.trafficmanager.net/in/';

  async function participant() {
    const oid = randomUUID();
    const userId = await t.user('student', { msOid: oid });
    return { oid, userId, meetingId: `meeting-${randomUUID()}` };
  }

  /** Fixed instants an hour ago, offset in minutes. */
  function clock(): (offsetMinutes: number) => Date {
    const base = Date.now() - HOUR;
    return (offsetMinutes) => new Date(base + minutes(offsetMinutes));
  }

  it('stores a conversation once and updates it without losing known fields', async () => {
    const conversationId = `19:${randomUUID()}@thread.tacv2`;
    const meetingId = `meeting-${randomUUID()}`;
    await t.botConversation(conversationId, SERVICE_URL, meetingId);
    await t.botConversation(conversationId, 'https://smba.trafficmanager.net/emea/', null);

    const rows = await t.rows(`select service_url, meeting_id, tenant_id from pad_bot_conversations where conversation_id = $1`, [conversationId]);
    expect(rows).toEqual([{ service_url: 'https://smba.trafficmanager.net/emea/', meeting_id: meetingId, tenant_id: 'tenant-1' }]);
  });

  it('maps a join to the Nexus user by Microsoft object id, ignoring case, and keeps the latest Teams id', async () => {
    const p = await participant();
    const T = clock();

    expect(await t.botParticipant(p.meetingId, p.oid.toUpperCase(), '29:first', 'join', T(0))).toEqual({ ok: true, mapped: true, user_id: p.userId });
    expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([[iso(T(0)), null]]);

    await t.botParticipant(p.meetingId, p.oid, '29:second', 'leave', T(5));
    const [teams] = await t.rows<{ teams_user_id: string }>(`select teams_user_id from pad_teams_users where user_id = $1`, [p.userId]);
    expect(teams.teams_user_id).toBe('29:second');
  });

  it('records nothing for someone Nexus does not know, and rejects malformed events', async () => {
    const meetingId = `meeting-${randomUUID()}`;
    expect(await t.botParticipant(meetingId, randomUUID(), '29:guest', 'join')).toEqual({ ok: true, mapped: false });
    const [count] = await t.rows<{ n: number }>(`select count(*)::int as n from pad_meeting_presence where meeting_id = $1`, [meetingId]);
    expect(count.n).toBe(0);

    const p = await participant();
    const missing = null as unknown as string;
    expect(await t.botParticipant(p.meetingId, p.oid, null, 'wave')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.botParticipant(p.meetingId, p.oid, null, missing)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.botParticipant(missing, p.oid, null, 'join')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.botParticipant(p.meetingId, missing, null, 'join')).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([]);
  });

  describe('meeting intervals under duplicate and out-of-order delivery', () => {
    it('closes the interval on leave, and a repeated leave changes nothing', async () => {
      const p = await participant();
      const T = clock();
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([[iso(T(0)), iso(T(10))]]);
    });

    it('never leaves an interval open after a repeated join', async () => {
      const p = await participant();
      const T = clock();
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(1));
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([[iso(T(0)), iso(T(10))]]);
    });

    it('ignores a join retried after the leave it belongs to', async () => {
      const p = await participant();
      const T = clock();
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([[iso(T(0)), iso(T(10))]]);
    });

    it('closes a join that arrives after its leave instead of leaving it open', async () => {
      const p = await participant();
      const T = clock();
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));

      const intervals = await t.meetingIntervals(p.meetingId, p.userId);
      expect(intervals.filter(([, left]) => left === null)).toEqual([]);
      expect(intervals).toContainEqual([iso(T(0)), iso(T(10))]);

      const present = async (from: Date, to: Date): Promise<boolean> => {
        const [row] = await t.rows<{ present: boolean }>(
          `select pad_was_present(null::uuid, $1::text, null::uuid, $2::uuid, $3::timestamptz, $4::timestamptz) as present`,
          [p.meetingId, p.userId, iso(from), iso(to)],
        );
        return row.present;
      };
      expect(await present(T(2), T(4))).toBe(true);
      expect(await present(T(11), T(20))).toBe(false);
    });

    it('keeps separate intervals for leaving and rejoining', async () => {
      const p = await participant();
      const T = clock();
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(0));
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(10));
      await t.botParticipant(p.meetingId, p.oid, null, 'join', T(20));
      expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([
        [iso(T(0)), iso(T(10))],
        [iso(T(20)), null],
      ]);
      await t.botParticipant(p.meetingId, p.oid, null, 'leave', T(30));
      expect(await t.meetingIntervals(p.meetingId, p.userId)).toEqual([
        [iso(T(0)), iso(T(10))],
        [iso(T(20)), iso(T(30))],
      ]);
    });
  });

  it('closes every open interval in the meeting when it ends, and nothing in other meetings', async () => {
    const a = await participant();
    const b = await participant();
    const otherMeeting = `meeting-${randomUUID()}`;
    const T = clock();
    await t.botParticipant(a.meetingId, a.oid, null, 'join', T(0));
    await t.botParticipant(a.meetingId, b.oid, null, 'join', T(5));
    await t.botParticipant(otherMeeting, a.oid, null, 'join', T(0));

    expect(await t.botMeetingEnd(a.meetingId, T(60))).toEqual({ ok: true, closed: 2 });
    expect(await t.meetingIntervals(a.meetingId, a.userId)).toEqual([[iso(T(0)), iso(T(60))]]);
    expect(await t.meetingIntervals(a.meetingId, b.userId)).toEqual([[iso(T(5)), iso(T(60))]]);
    expect(await t.meetingIntervals(otherMeeting, a.userId)).toEqual([[iso(T(0)), null]]);

    // A meeting-end time earlier than a join never produces a negative interval.
    const c = await participant();
    await t.botParticipant(c.meetingId, c.oid, null, 'join', T(70));
    expect(await t.botMeetingEnd(c.meetingId, T(65))).toEqual({ ok: true, closed: 1 });
    expect(await t.meetingIntervals(c.meetingId, c.userId)).toEqual([[iso(T(70)), iso(T(70))]]);
  });

  it('feeds readiness, presence_basis and notification targets end to end', async () => {
    const s = await session(2);
    const [inMeeting, other] = s.students;
    const oid = await t.msOid(inMeeting);

    await t.botParticipant(s.meetingId, oid, '29:in-meeting', 'join');
    let snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.readiness.in_meeting).toBe(1);
    expect(snap.session.presence_basis).toBe('meeting');
    expect(await t.notificationTargets(s.teacherId, s.sessionId, s.students)).toEqual({
      ok: true,
      meeting_presence_known: true,
      not_connected: 1,
      recipients: ['29:in-meeting'],
    });

    await tick();
    await t.botParticipant(s.meetingId, oid, '29:in-meeting', 'leave');
    snap = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(snap.readiness.in_meeting).toBe(0);
    const afterLeave = await t.notificationTargets(s.teacherId, s.sessionId, [inMeeting, other]);
    expect(afterLeave).toEqual({ ok: true, meeting_presence_known: false, not_connected: 2, recipients: ['29:in-meeting'] });
  });
});

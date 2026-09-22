// @vitest-environment node
/**
 * Answer Pad class tools from the first live class (migration 20261003090100):
 * a picture and option text on the question, "I can't answer" with a reason,
 * and the teacher's nudge. Every assertion runs the real migration SQL in PGlite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb, at, type ClassFixture } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

interface LiveSession extends ClassFixture {
  sessionId: string;
}

async function liveSession(students = 3): Promise<LiveSession> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId);
  expect(started).toMatchObject({ ok: true });
  return { ...fixture, sessionId: started.session_id };
}

async function openPrompt(s: LiveSession): Promise<string> {
  const asked = await t.ask(s.teacherId, s.sessionId);
  expect(asked.ok).toBe(true);
  return asked.prompt_id;
}

const picture = (sessionId: string, file = '0d9a1c5e-1111-4222-8333-444455556666.jpg') =>
  `https://db.neramclasses.com/storage/v1/object/public/uploads/pad/${sessionId}/${file}`;

/** The pad counts as open for a student whose heartbeat is this recent. */
async function padOpen(s: LiveSession, studentId: string) {
  const now = new Date();
  await t.appPresence(s.sessionId, studentId, at(now, -60_000), now);
}

describe('the picture and option text', () => {
  it("asks with a picture of the paper and each option's text, and both reach the student", async () => {
    const s = await liveSession(1);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, {
      label: '38',
      imageUrl: picture(s.sessionId),
      optionTexts: ['Both correct', ' ', 'Both   wrong', null],
    });
    expect(asked).toMatchObject({ ok: true, changed: true });

    const student = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(student.prompt).toMatchObject({
      image_url: picture(s.sessionId),
      option_texts: ['Both correct', null, 'Both wrong', null],
    });
    const teacher = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(teacher.prompt).toMatchObject({ image_url: picture(s.sessionId), option_texts: ['Both correct', null, 'Both wrong', null] });
  });

  it('stores no option text when every option was left blank, or for a question that is not multiple choice', async () => {
    const s = await liveSession();
    const blank = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { optionTexts: ['', ' ', null, ''] });
    const [row] = await t.rows<{ option_texts: string[] | null }>(`select option_texts from pad_prompts where id = $1`, [blank.prompt_id]);
    expect(row.option_texts).toBeNull();

    await t.close(s.teacherId, blank.prompt_id);
    const typed = await t.ask(s.teacherId, s.sessionId, 'numeric', null, { optionTexts: ['one', 'two'] });
    const [typedRow] = await t.rows<{ option_texts: string[] | null }>(`select option_texts from pad_prompts where id = $1`, [typed.prompt_id]);
    expect(typedRow.option_texts).toBeNull();
  });

  it('refuses option text that does not match the option count, or runs past 200 characters', async () => {
    const s = await liveSession();
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { optionTexts: ['A', 'B'] })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      field: 'options',
    });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 2, { optionTexts: ['x'.repeat(201), 'B'] })).toMatchObject({
      ok: false,
      field: 'options',
    });
  });

  it('refuses a picture from anywhere but this session\'s own upload folder', async () => {
    const s = await liveSession();
    const other = await liveSession();
    for (const imageUrl of [
      picture(other.sessionId),
      'http://db.neramclasses.com/storage/v1/object/public/uploads/pad/x.jpg',
      'https://evil.example/tracker.gif',
      `javascript:alert(1)//uploads/pad/${s.sessionId}/`,
    ]) {
      expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { imageUrl })).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'image' });
    }
  });

  it('adds, replaces and removes the picture after the ASK while the class runs, for its teacher only', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.picture(s.teacherId, promptId, picture(s.sessionId))).toMatchObject({ ok: true, changed: true, version: 2 });
    expect(await t.picture(s.teacherId, promptId, picture(s.sessionId))).toMatchObject({ ok: true, changed: false });
    expect(await t.picture(s.teacherId, promptId, picture(s.sessionId, 'b.png'))).toMatchObject({ ok: true, changed: true });
    expect(await t.picture(s.teacherId, promptId, null)).toMatchObject({ ok: true, changed: true });

    const intruder = await t.user('teacher');
    expect(await t.picture(intruder, promptId, picture(s.sessionId))).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.picture(s.teacherId, promptId, 'https://evil.example/x.png')).toMatchObject({ ok: false, field: 'image' });

    await t.end(s.teacherId, s.sessionId, true);
    expect(await t.picture(s.teacherId, promptId, picture(s.sessionId))).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
  });

  it('shows the picture in the class report', async () => {
    const s = await liveSession(1);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { imageUrl: picture(s.sessionId) });
    await t.close(s.teacherId, asked.prompt_id);
    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.prompts[0]).toMatchObject({ image_url: picture(s.sessionId) });
  });
});

describe("I can't answer", () => {
  it('saves a reason, lets the student change or withdraw it, and shows it on their pad', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    const student = s.students[0];

    expect(await t.skip(student, promptId, 'dont_know')).toEqual({ ok: true, status: 'saved', reason: 'dont_know', note: null });
    expect((await t.studentSnapshot(student, s.sessionId)).my_skip).toEqual({ reason: 'dont_know', note: null });

    expect(await t.skip(student, promptId, 'other', '  my screen   froze ')).toMatchObject({ ok: true, reason: 'other', note: 'my screen froze' });
    expect((await t.studentSnapshot(student, s.sessionId)).my_skip).toEqual({ reason: 'other', note: 'my screen froze' });

    expect(await t.skip(student, promptId, null)).toEqual({ ok: true, status: 'cleared' });
    expect((await t.studentSnapshot(student, s.sessionId)).my_skip).toBeNull();
  });

  it('never locks the student out: answering afterwards counts, and the answer wins', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    const student = s.students[0];
    await t.skip(student, promptId, 'need_time');

    expect(await t.submit(student, promptId, 'C')).toMatchObject({ ok: true, status: 'accepted' });
    const snap = await t.studentSnapshot(student, s.sessionId);
    expect(snap.my_response).toMatchObject({ answer: 'C' });
    expect(snap.my_skip).toBeNull();
    expect(await t.skip(student, promptId, 'dont_know')).toEqual({ ok: true, status: 'answered' });
  });

  it('refuses a reason once the question has closed, from someone not enrolled, or outside the list', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    const outsider = await t.user('student');

    expect(await t.skip(outsider, promptId, 'dont_know')).toMatchObject({ ok: false, code: 'NOT_ENROLLED' });
    expect(await t.skip(s.students[0], promptId, 'bored')).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'reason' });
    expect(await t.skip(s.students[0], promptId, 'other', 'x'.repeat(81))).toMatchObject({ ok: false, field: 'note' });

    await t.close(s.teacherId, promptId);
    expect(await t.skip(s.students[0], promptId, 'dont_know')).toMatchObject({ ok: false, code: 'PROMPT_NOT_OPEN' });
  });

  it('gives the teacher counts by reason while the question is open, and names only after Close', async () => {
    const s = await liveSession(4);
    const promptId = await openPrompt(s);
    await t.skip(s.students[0], promptId, 'dont_know');
    await t.skip(s.students[1], promptId, 'dont_know');
    await t.skip(s.students[2], promptId, 'cant_see');
    await t.submit(s.students[3], promptId, 'A');

    const open = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(open.skips).toEqual({ total: 3, by_reason: { dont_know: 2, cant_see: 1 } });
    expect(JSON.stringify(open)).not.toContain(s.students[0]);
    expect(await t.participation(s.teacherId, promptId, s.students)).toMatchObject({ ok: false, code: 'PROMPT_OPEN' });

    await t.close(s.teacherId, promptId);
    const named = await t.participation(s.teacherId, promptId, s.students);
    const reasonFor = (id: string) => named.rows.find((row: { student_id: string }) => row.student_id === id);
    expect(reasonFor(s.students[2])).toMatchObject({ skip_reason: 'cant_see', skip_note: null });
    expect(reasonFor(s.students[3])).toMatchObject({ answer: 'A', skip_reason: null });

    const report = await t.report(s.teacherId, s.sessionId, s.students);
    expect(report.prompts[0].skips).toEqual({ dont_know: 2, cant_see: 1 });
  });

  it('keeps pad_skip_reasons behind its function, even for a caller holding the service key', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    await expect(
      t.db.query(`insert into pad_skip_reasons (prompt_id, student_id, reason) values ($1, $2, 'dont_know')`, [promptId, s.students[0]]),
    ).rejects.toThrow(/only through pad_set_skip_reason/);
  });
});

describe('the nudge', () => {
  it('marks everyone who has neither answered nor said why, split by whether their pad is open', async () => {
    const s = await liveSession(4);
    const [answered, explained, open, closed] = s.students;
    const promptId = await openPrompt(s);
    await t.submit(answered, promptId, 'A');
    await t.skip(explained, promptId, 'dont_know');
    await padOpen(s, open);

    const result = await t.nudge(s.teacherId, promptId, s.students);
    expect(result).toEqual({ ok: true, pad_open: [open], pad_closed: [closed] });

    // Only the nudged students see the banner.
    expect((await t.studentSnapshot(open, s.sessionId)).nudged_at).toEqual(expect.any(String));
    expect((await t.studentSnapshot(answered, s.sessionId)).nudged_at).toBeNull();
    expect((await t.studentSnapshot(explained, s.sessionId)).nudged_at).toBeNull();

    // Answering or giving a reason takes the banner away.
    await t.skip(open, promptId, 'need_time');
    expect((await t.studentSnapshot(open, s.sessionId)).nudged_at).toBeNull();

    const teacher = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(teacher.prompt.last_nudged_at).toEqual(expect.any(String));
  });

  it('nudges a question at most once a minute, and again after', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    expect(await t.nudge(s.teacherId, promptId, s.students)).toMatchObject({ ok: true });

    const again = await t.nudge(s.teacherId, promptId, s.students);
    expect(again).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    expect(again.retry_after_seconds).toBeGreaterThan(50);

    await t.ageNudges(promptId, 61);
    expect(await t.nudge(s.teacherId, promptId, s.students)).toMatchObject({ ok: true, pad_closed: expect.any(Array) });
    const [row] = await t.rows<{ times: number }>(`select times from pad_nudges where prompt_id = $1 limit 1`, [promptId]);
    expect(row.times).toBe(2);
  });

  it('refuses another teacher, a closed question and an ended class', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    const intruder = await t.user('teacher');
    expect(await t.nudge(intruder, promptId, s.students)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });

    await t.close(s.teacherId, promptId);
    expect(await t.nudge(s.teacherId, promptId, s.students)).toMatchObject({ ok: false, code: 'PROMPT_NOT_OPEN' });

    await t.end(s.teacherId, s.sessionId, true);
    expect(await t.nudge(s.teacherId, promptId, s.students)).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
  });

  it('never marks anyone off the class list the server passed, or no longer enrolled', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    const stranger = await t.user('student');
    const result = await t.nudge(s.teacherId, promptId, [...s.students, stranger]);
    expect([...result.pad_open, ...result.pad_closed].sort()).toEqual([...s.students].sort());
  });

  it('keeps pad_nudges behind its function, even for a caller holding the service key', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    await expect(
      t.db.query(`insert into pad_nudges (prompt_id, student_id) values ($1, $2)`, [promptId, s.students[0]]),
    ).rejects.toThrow(/only through pad_nudge/);
  });
});

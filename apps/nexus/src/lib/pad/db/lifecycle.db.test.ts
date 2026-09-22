// @vitest-environment node
/**
 * Answer Pad prompt lifecycle, sessions and database guards (spec sections 4, 8,
 * 9 and 12). Every assertion runs the real migration SQL in PGlite.
 */
import { writeFileSync } from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PadTestDb, type ClassFixture } from './test-harness';

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

async function liveSession(students = 3, opts: { meetingId?: string; scheduledClassId?: string } = {}): Promise<LiveSession> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId, opts);
  expect(started).toMatchObject({ ok: true, resumed: false });
  return { ...fixture, sessionId: started.session_id };
}

async function openPrompt(s: LiveSession, type = 'mcq', options: number | null = 4): Promise<string> {
  const asked = await t.ask(s.teacherId, s.sessionId, type, type === 'mcq' ? options : null);
  expect(asked.ok).toBe(true);
  return asked.prompt_id;
}

async function prompt(promptId: string) {
  const [row] = await t.rows(`select * from pad_prompts where id = $1`, [promptId]);
  return row as {
    state: string;
    version: number;
    correct_keys: string[] | null;
    ungraded: boolean;
    closed_at: string | null;
    revealed_at: string | null;
    sequence: number;
    option_count: number | null;
    label: string | null;
    question_text: string | null;
  };
}

describe('migration and privileges', () => {
  const tables = [
    'pad_sessions',
    'pad_prompts',
    'pad_responses',
    'pad_app_presence',
    'pad_meeting_presence',
    'pad_events',
    'pad_join_attempts',
    'pad_bot_conversations',
    'pad_teams_users',
    'pad_skip_reasons',
    'pad_nudges',
  ];

  it('applies cleanly a second time and changes nothing, as a re-run deploy would', async () => {
    const before = await t.fingerprint();
    expect(before.objects).toBeGreaterThan(100);
    await t.reapplyMigration();
    expect(await t.fingerprint()).toEqual(before);
    // The staging and production schema check compares against this value.
    if (process.env.PAD_FINGERPRINT_OUT) writeFileSync(process.env.PAD_FINGERPRINT_OUT, JSON.stringify(before));
  });

  it('creates every pad table with row level security enabled', async () => {
    const rows = await t.rows<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = any($1::text[]) and relkind = 'r'`,
      [`{${tables.join(',')}}`],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...tables].sort());
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('gives anon and authenticated no privilege on any pad table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const [row] = await t.rows<{ ok: boolean }>(`select has_table_privilege($1, $2, $3) as ok`, [role, table, privilege]);
          expect({ role, table, privilege, allowed: row.ok }).toEqual({ role, table, privilege, allowed: false });
        }
      }
    }
  });

  it('gives anon and authenticated no privilege on the sequences behind pad tables', async () => {
    const sequences = await t.rows<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'pad\\_%'`,
    );
    expect(sequences.length).toBeGreaterThanOrEqual(4);
    for (const role of ['anon', 'authenticated']) {
      for (const { name } of sequences) {
        for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
          const [row] = await t.rows<{ ok: boolean }>(`select has_sequence_privilege($1, $2, $3) as ok`, [role, name, privilege]);
          expect({ role, name, privilege, allowed: row.ok }).toEqual({ role, name, privilege, allowed: false });
        }
      }
    }
  });

  it('runs against Supabase-style default grants, so the revokes above are doing real work', async () => {
    const [row] = await t.rows<{ ok: boolean }>(`select has_table_privilege('anon', 'nexus_classrooms', 'SELECT') as ok`);
    expect(row.ok).toBe(true);
  });

  it('lets only service_role execute pad functions', async () => {
    const functions = await t.rows<{ sig: string }>(
      `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'pad\\_%'`,
    );
    expect(functions.length).toBeGreaterThan(25);
    for (const { sig } of functions) {
      for (const role of ['anon', 'authenticated', 'public']) {
        if (role === 'public') continue; // PUBLIC is not a role name has_function_privilege accepts
        const [row] = await t.rows<{ ok: boolean }>(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, sig]);
        expect({ role, sig, allowed: row.ok }).toEqual({ role, sig, allowed: false });
      }
      const [svc] = await t.rows<{ ok: boolean }>(`select has_function_privilege('service_role', $1, 'EXECUTE') as ok`, [sig]);
      expect({ sig, allowed: svc.ok }).toEqual({ sig, allowed: true });
    }
  });

  it('refuses a direct read as anon and a direct RPC as authenticated', async () => {
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query('set local role anon');
        await tx.query('select * from pad_sessions');
      }),
    ).rejects.toThrow(/permission denied/i);

    const s = await liveSession(1);
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query('set local role authenticated');
        await tx.query(`select pad_ask($1::uuid, $2::uuid, 'mcq', 4)`, [s.teacherId, s.sessionId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('works for service_role through the functions', async () => {
    const s = await liveSession(1);
    const result = await t.db.transaction(async (tx) => {
      await tx.query('set local role service_role');
      const res = await tx.query<{ r: { ok: boolean } }>(`select pad_ask($1::uuid, $2::uuid, 'mcq', 4) as r`, [s.teacherId, s.sessionId]);
      return res.rows[0].r;
    });
    expect(result.ok).toBe(true);
  });
});

describe('sessions', () => {
  it('starts a live session with a 6-digit room code and two distinct random topics', async () => {
    const s = await liveSession();
    const [row] = await t.rows<{ room_code: string; status: string; hint_topic: string; teacher_topic: string }>(
      `select room_code, status, hint_topic, teacher_topic from pad_sessions where id = $1`,
      [s.sessionId],
    );
    expect(row.status).toBe('live');
    expect(row.room_code).toMatch(/^\d{6}$/);
    expect(row.hint_topic.length).toBeGreaterThanOrEqual(60);
    expect(row.teacher_topic.length).toBeGreaterThanOrEqual(60);
    expect(row.hint_topic).not.toBe(row.teacher_topic);
  });

  it('refuses to let a student or an unknown user start a session', async () => {
    const fixture = await t.classWithStudents(1);
    expect(await t.start(fixture.students[0], fixture.classroomId)).toEqual({ ok: false, code: 'NOT_STAFF' });
    expect(await t.start(null, fixture.classroomId)).toEqual({ ok: false, code: 'NOT_STAFF' });
  });

  it('lets a manager start a session', async () => {
    const classroomId = await t.classroom();
    const manager = await t.user('manager');
    expect((await t.start(manager, classroomId)).ok).toBe(true);
  });

  it('resumes silently for the same class and meeting', async () => {
    const s = await liveSession(1, { meetingId: 'meeting-resume' });
    const again = await t.start(s.teacherId, s.classroomId, { meetingId: 'meeting-resume' });
    expect(again).toMatchObject({ ok: true, resumed: true, session_id: s.sessionId });
    const events = await t.events(s.sessionId);
    expect(events.map((e) => e.action)).toContain('session_resume');
  });

  it('never silently reuses a session for another class', async () => {
    const s = await liveSession(1);
    const otherClassroom = await t.classroom('Other class');
    const conflict = await t.start(s.teacherId, otherClassroom);
    expect(conflict).toMatchObject({ ok: false, code: 'SESSION_CONFLICT', existing: { session_id: s.sessionId } });

    const replaced = await t.start(s.teacherId, otherClassroom, { endExisting: true });
    expect(replaced).toMatchObject({ ok: true, resumed: false, ended_session_id: s.sessionId });
    const [old] = await t.rows<{ status: string }>(`select status from pad_sessions where id = $1`, [s.sessionId]);
    expect(old.status).toBe('ended');
  });

  it('does not silently resume a session older than 6 hours', async () => {
    const s = await liveSession(1);
    await t.ageSession(s.sessionId, 7);
    expect(await t.start(s.teacherId, s.classroomId)).toMatchObject({ ok: false, code: 'SESSION_CONFLICT' });
  });

  it('keeps room codes unique among live sessions only', async () => {
    const s = await liveSession(1);
    const [row] = await t.rows<{ room_code: string }>(`select room_code from pad_sessions where id = $1`, [s.sessionId]);
    const other = await t.classWithStudents(0);
    await expect(
      t.rows(
        `insert into pad_sessions (classroom_id, teacher_id, room_code, hint_topic, teacher_topic)
         values ($1, $2, $3, 'x', 'y')`,
        [other.classroomId, other.teacherId, row.room_code],
      ),
    ).rejects.toThrow(/pad_sessions_live_room_code/);

    await t.end(s.teacherId, s.sessionId);
    await t.rows(
      `insert into pad_sessions (classroom_id, teacher_id, room_code, hint_topic, teacher_topic)
       values ($1, $2, $3, 'x', 'y')`,
      [other.classroomId, other.teacherId, row.room_code],
    );
  });

  it('asks for confirmation before ending with an unrevealed prompt, then closes it', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.end(s.teacherId, s.sessionId)).toEqual({ ok: false, code: 'UNREVEALED_PROMPT', sequence: 1, label: null, count: 1 });
    expect(await t.end(s.teacherId, s.sessionId, true)).toEqual({ ok: true, changed: true });
    expect((await prompt(promptId)).state).toBe('closed');
    expect(await t.end(s.teacherId, s.sessionId, true)).toEqual({ ok: true, changed: false });
  });

  it('counts every question still without an answer, and names the first by its reference', async () => {
    const s = await liveSession();
    const q1 = (await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { label: '38' })).prompt_id;
    await t.close(s.teacherId, q1);
    await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { label: '39' });
    expect(await t.end(s.teacherId, s.sessionId)).toEqual({ ok: false, code: 'UNREVEALED_PROMPT', sequence: 1, label: '38', count: 2 });
  });

  it('refuses ASK and Reopen once the session has ended', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.end(s.teacherId, s.sessionId, true);
    expect(await t.ask(s.teacherId, s.sessionId)).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
    expect(await t.reopen(s.teacherId, promptId)).toMatchObject({ ok: false, code: 'SESSION_NOT_LIVE' });
  });

  // The teacher checks the answer after class (a search, or the class itself)
  // and marks it from the class report; the scores follow.
  it('still lets the session teacher set the key and reveal after the class has ended', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'C');
    await t.submit(s.students[1], promptId, 'A');
    await t.end(s.teacherId, s.sessionId, true);

    // The report hands the key picker what it needs: the answers, counted.
    const before = await t.report(s.teacherId, s.sessionId, s.students);
    expect(before.prompts[0]).toMatchObject({
      state: 'closed',
      correct_keys: null,
      groups: [
        { value: 'A', count: 1 },
        { value: 'C', count: 1 },
      ],
    });

    const intruder = await t.user('teacher');
    expect(await t.setKey(intruder, promptId, ['C'])).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.setKey(s.teacherId, promptId, ['C'])).toMatchObject({ ok: true, changed: true });
    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true, changed: true, state: 'revealed' });

    const mine = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(mine.my_response).toMatchObject({ answer: 'C', is_correct: true });
    const events = await t.events(s.sessionId);
    expect(events.find((e) => e.action === 'reveal')?.detail).toMatchObject({ after_class: true });
  });

  it('refuses to let another teacher end a session', async () => {
    const s = await liveSession();
    const intruder = await t.user('teacher');
    expect(await t.end(intruder, s.sessionId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
  });
});

describe('ASK', () => {
  it('creates an OPEN prompt with no key, sequence 1, version 1', async () => {
    const s = await liveSession();
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    expect(asked).toMatchObject({ ok: true, changed: true, state: 'open', version: 1, sequence: 1 });
    const row = await prompt(asked.prompt_id);
    expect(row).toMatchObject({ state: 'open', correct_keys: null, ungraded: false, option_count: 4 });
  });

  it('returns the prompt already open when ASK is repeated', async () => {
    const s = await liveSession();
    const first = await t.ask(s.teacherId, s.sessionId);
    const second = await t.ask(s.teacherId, s.sessionId);
    expect(second).toMatchObject({ ok: true, changed: false, prompt_id: first.prompt_id });
    const [{ n }] = await t.rows<{ n: number }>(`select count(*)::int as n from pad_prompts where session_id = $1`, [s.sessionId]);
    expect(n).toBe(1);
  });

  // "Decide later": the closed question keeps its answers and waits for a key.
  it('asks the next question while an earlier one is CLOSED with no answer yet', async () => {
    const s = await liveSession(1);
    const q1 = await openPrompt(s);
    await t.submit(s.students[0], q1, 'B');
    await t.close(s.teacherId, q1);

    const q2 = await t.ask(s.teacherId, s.sessionId);
    expect(q2).toMatchObject({ ok: true, changed: true, sequence: 2, state: 'open' });
    expect((await prompt(q1)).state).toBe('closed');

    // Students see the newest question; the earlier one can still be settled.
    expect((await t.studentSnapshot(s.students[0], s.sessionId)).prompt).toMatchObject({ id: q2.prompt_id, state: 'open' });
    expect(await t.setKey(s.teacherId, q1, ['B'])).toMatchObject({ ok: true, changed: true });
    expect(await t.reveal(s.teacherId, q1)).toMatchObject({ ok: true, state: 'revealed' });
    expect((await prompt(q2.prompt_id)).state).toBe('open');
  });

  it('refuses to reopen a question once a newer one exists, since students only see the newest', async () => {
    const s = await liveSession();
    const q1 = await openPrompt(s);
    await t.close(s.teacherId, q1);
    const q2 = (await t.ask(s.teacherId, s.sessionId)).prompt_id;
    expect(await t.reopen(s.teacherId, q1)).toEqual({ ok: false, code: 'NOT_LATEST_PROMPT' });
    await t.close(s.teacherId, q2);
    expect(await t.reopen(s.teacherId, q1)).toEqual({ ok: false, code: 'NOT_LATEST_PROMPT' });
    expect(await t.reopen(s.teacherId, q2)).toMatchObject({ ok: true, changed: true, state: 'open' });
  });

  it("carries the teacher's reference and question text from ASK to every snapshot", async () => {
    const s = await liveSession(1);
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, {
      label: '  38 ',
      text: 'Which   statement is correct?\n\n\n\nPick one.',
    });
    expect(asked).toMatchObject({ ok: true, label: '38' });
    const cleaned = 'Which statement is correct?\n\nPick one.';
    expect(await prompt(asked.prompt_id)).toMatchObject({ label: '38', question_text: cleaned });

    const student = await t.studentSnapshot(s.students[0], s.sessionId);
    expect(student.prompt).toMatchObject({ label: '38', question_text: cleaned });
    const teacher = await t.teacherSnapshot(s.teacherId, s.sessionId, s.students);
    expect(teacher.prompt).toMatchObject({ label: '38', question_text: cleaned });
    expect(teacher.history[0]).toMatchObject({ label: '38', option_count: 4 });
  });

  it('asks with neither a reference nor a question, as before', async () => {
    const s = await liveSession();
    const asked = await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { label: '   ', text: '' });
    expect(await prompt(asked.prompt_id)).toMatchObject({ label: null, question_text: null });
  });

  it('refuses a reference over 80 characters or a question over 500', async () => {
    const s = await liveSession();
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { label: 'x'.repeat(81) })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      field: 'label',
    });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 4, { text: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      field: 'text',
    });
  });

  it('edits the reference and question text in any state, for the session teacher only', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.details(s.teacherId, promptId, 'Q38', 'Which one?')).toMatchObject({ ok: true, changed: true, version: 2 });
    expect(await t.details(s.teacherId, promptId, 'Q38', 'Which one?')).toMatchObject({ ok: true, changed: false });
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A']);
    await t.reveal(s.teacherId, promptId);
    expect(await t.details(s.teacherId, promptId, '38', null)).toMatchObject({ ok: true, changed: true });
    expect(await prompt(promptId)).toMatchObject({ label: '38', question_text: null });

    const intruder = await t.user('teacher');
    expect(await t.details(intruder, promptId, '1', null)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.details(s.teacherId, promptId, 'x'.repeat(81), null)).toMatchObject({ ok: false, field: 'label' });
    expect(await t.details(s.teacherId, promptId, null, 'x'.repeat(501))).toMatchObject({ ok: false, field: 'text' });
  });

  it('numbers the next prompt after a Reveal', async () => {
    const s = await liveSession();
    const q1 = await openPrompt(s);
    await t.close(s.teacherId, q1);
    await t.setKey(s.teacherId, q1, ['B']);
    await t.reveal(s.teacherId, q1);
    const q2 = await t.ask(s.teacherId, s.sessionId, 'numeric', null);
    expect(q2).toMatchObject({ ok: true, sequence: 2 });
    expect((await prompt(q2.prompt_id)).option_count).toBeNull();
  });

  it('validates the answer type and option count', async () => {
    const s = await liveSession();
    expect(await t.ask(s.teacherId, s.sessionId, 'essay', null)).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'answer_type' });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 7)).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'option_count' });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 1)).toMatchObject({ ok: false, code: 'INVALID_INPUT', field: 'option_count' });
    expect(await t.ask(s.teacherId, s.sessionId, 'mcq', 6)).toMatchObject({ ok: true });
  });

  it('refuses a student and another teacher, and logs the refusal', async () => {
    const s = await liveSession();
    const intruder = await t.user('teacher');
    expect(await t.ask(s.students[0], s.sessionId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    expect(await t.ask(intruder, s.sessionId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    const rejected = (await t.events(s.sessionId)).filter((e) => e.action === 'ask_rejected');
    expect(rejected).toHaveLength(2);
    expect(rejected[0].detail).toMatchObject({ code: 'NOT_SESSION_TEACHER' });
  });
});

describe('CLOSE, REOPEN, SET KEY, REVEAL', () => {
  it('moves OPEN to CLOSED once, and a repeated CLOSE is a no-op', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.close(s.teacherId, promptId)).toMatchObject({ ok: true, changed: true, state: 'closed', version: 2 });
    expect(await t.close(s.teacherId, promptId)).toMatchObject({ ok: true, changed: false, state: 'closed', version: 2 });
    expect((await prompt(promptId)).closed_at).not.toBeNull();
  });

  it('refuses REVEAL from OPEN and SET KEY while OPEN', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.reveal(s.teacherId, promptId)).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'open' });
    expect(await t.setKey(s.teacherId, promptId, ['A'])).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'open' });
    expect(await t.setKey(s.teacherId, promptId, null, true)).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'open' });
  });

  it('refuses REVEAL without a grading decision', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    expect(await t.reveal(s.teacherId, promptId)).toEqual({ ok: false, code: 'KEY_REQUIRED' });
  });

  it('normalises, de-duplicates and sorts MCQ keys, and rejects keys beyond the option count', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s, 'mcq', 4);
    await t.close(s.teacherId, promptId);
    expect(await t.setKey(s.teacherId, promptId, ['e'])).toEqual({ ok: false, code: 'INVALID_KEY' });
    expect(await t.setKey(s.teacherId, promptId, [])).toEqual({ ok: false, code: 'INVALID_KEY' });
    expect(await t.setKey(s.teacherId, promptId, ['b', 'B', ' a '])).toMatchObject({ ok: true, changed: true });
    expect((await prompt(promptId)).correct_keys).toEqual(['A', 'B']);
  });

  it('treats setting the same key again as a no-op and changing it as a new version', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    const first = await t.setKey(s.teacherId, promptId, ['C']);
    const same = await t.setKey(s.teacherId, promptId, ['c']);
    expect(same).toMatchObject({ ok: true, changed: false, version: first.version });
    const changed = await t.setKey(s.teacherId, promptId, ['D']);
    expect(changed).toMatchObject({ ok: true, changed: true });
    expect(changed.version).toBe(first.version + 1);
    expect((await prompt(promptId)).correct_keys).toEqual(['D']);
  });

  it('switches cleanly between a key and Poll / Do not grade', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A']);
    await t.setKey(s.teacherId, promptId, null, true);
    expect(await prompt(promptId)).toMatchObject({ ungraded: true, correct_keys: null });
    await t.setKey(s.teacherId, promptId, ['B']);
    expect(await prompt(promptId)).toMatchObject({ ungraded: false, correct_keys: ['B'] });
  });

  it('REOPEN clears any grading decision but keeps locked answers', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    expect((await t.submit(s.students[0], promptId, 'A')).status).toBe('accepted');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A']);

    expect(await t.reopen(s.teacherId, promptId)).toMatchObject({ ok: true, changed: true, state: 'open' });
    expect(await prompt(promptId)).toMatchObject({ state: 'open', correct_keys: null, ungraded: false, closed_at: null });
    expect(await t.reopen(s.teacherId, promptId)).toMatchObject({ ok: true, changed: false });

    // The student who answered stays locked; the other can answer now.
    expect(await t.submit(s.students[0], promptId, 'B')).toMatchObject({ ok: true, status: 'duplicate', answer: 'A' });
    expect(await t.submit(s.students[1], promptId, 'B')).toMatchObject({ ok: true, status: 'accepted', answer: 'B' });

    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, null, true);
    await t.reopen(s.teacherId, promptId);
    expect(await prompt(promptId)).toMatchObject({ ungraded: false, correct_keys: null });
  });

  it('grades at REVEAL, in the same transaction as the state change', async () => {
    const s = await liveSession(3);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'b');
    await t.submit(s.students[1], promptId, 'C');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['B']);

    const before = await t.rows<{ is_correct: boolean | null }>(`select is_correct from pad_responses where prompt_id = $1`, [promptId]);
    expect(before.every((r) => r.is_correct === null)).toBe(true);

    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true, changed: true, state: 'revealed' });
    const graded = await t.rows<{ student_id: string; is_correct: boolean }>(
      `select student_id, is_correct from pad_responses where prompt_id = $1`,
      [promptId],
    );
    const byStudent = Object.fromEntries(graded.map((r) => [r.student_id, r.is_correct]));
    expect(byStudent[s.students[0]]).toBe(true);
    expect(byStudent[s.students[1]]).toBe(false);
    expect((await prompt(promptId)).revealed_at).not.toBeNull();
  });

  it('accepts two correct answers for an ambiguous question', async () => {
    const s = await liveSession(3);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    await t.submit(s.students[1], promptId, 'C');
    await t.submit(s.students[2], promptId, 'D');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A', 'C']);
    await t.reveal(s.teacherId, promptId);
    const [{ correct }] = await t.rows<{ correct: number }>(
      `select count(*) filter (where is_correct)::int as correct from pad_responses where prompt_id = $1`,
      [promptId],
    );
    expect(correct).toBe(2);
  });

  it('leaves is_correct null for a poll', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, null, true);
    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true });
    const rows = await t.rows<{ is_correct: boolean | null }>(`select is_correct from pad_responses where prompt_id = $1`, [promptId]);
    expect(rows).toEqual([{ is_correct: null }]);
  });

  it('grades numeric answers on their normalised value', async () => {
    const s = await liveSession(3);
    const promptId = await openPrompt(s, 'numeric', null);
    await t.submit(s.students[0], promptId, '42');
    await t.submit(s.students[1], promptId, '42.0');
    await t.submit(s.students[2], promptId, '24');
    await t.close(s.teacherId, promptId);
    expect(await t.setKey(s.teacherId, promptId, ['42.00'])).toMatchObject({ ok: true });
    await t.reveal(s.teacherId, promptId);
    const [{ correct }] = await t.rows<{ correct: number }>(
      `select count(*) filter (where is_correct)::int as correct from pad_responses where prompt_id = $1`,
      [promptId],
    );
    expect(correct).toBe(2);
  });

  it('makes REVEALED terminal', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    await t.setKey(s.teacherId, promptId, ['A']);
    const revealed = await t.reveal(s.teacherId, promptId);
    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true, changed: false, version: revealed.version });
    expect(await t.close(s.teacherId, promptId)).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'revealed' });
    expect(await t.reopen(s.teacherId, promptId)).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'revealed' });
    expect(await t.setKey(s.teacherId, promptId, ['B'])).toEqual({ ok: false, code: 'INVALID_TRANSITION', state: 'revealed' });
  });

  it('increments version on every change a client renders', async () => {
    const s = await liveSession();
    const versions: number[] = [];
    const promptId = await openPrompt(s);
    versions.push((await prompt(promptId)).version);
    versions.push((await t.close(s.teacherId, promptId)).version);
    versions.push((await t.setKey(s.teacherId, promptId, ['A'])).version);
    versions.push((await t.reopen(s.teacherId, promptId)).version);
    versions.push((await t.close(s.teacherId, promptId)).version);
    versions.push((await t.setKey(s.teacherId, promptId, ['B'])).version);
    versions.push((await t.reveal(s.teacherId, promptId)).version);
    versions.push((await t.label(s.teacherId, promptId, 'Cantilever bending moment')).version);
    for (let i = 1; i < versions.length; i += 1) expect(versions[i]).toBe(versions[i - 1] + 1);
  });

  it('refuses every teacher transition from anyone but the session teacher', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    const student = s.students[0];
    const intruder = await t.user('admin');
    for (const actor of [student, intruder]) {
      expect(await t.close(actor, promptId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
      expect(await t.reopen(actor, promptId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
      expect(await t.setKey(actor, promptId, ['A'])).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
      expect(await t.reveal(actor, promptId)).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
      expect(await t.label(actor, promptId, 'x')).toMatchObject({ ok: false, code: 'NOT_SESSION_TEACHER' });
    }
    expect((await prompt(promptId)).state).toBe('open');
  });

  it('keeps notes to 80 characters and clears an empty one', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    expect(await t.label(s.teacherId, promptId, 'x'.repeat(81))).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await t.label(s.teacherId, promptId, '  Cantilever   bending moment ');
    expect((await t.rows<{ label: string }>(`select label from pad_prompts where id = $1`, [promptId]))[0].label).toBe(
      'Cantilever bending moment',
    );
    await t.label(s.teacherId, promptId, '   ');
    expect((await t.rows<{ label: string | null }>(`select label from pad_prompts where id = $1`, [promptId]))[0].label).toBeNull();
  });
});

describe('database guards, even for a caller holding the service key', () => {
  it('refuses a direct change of prompt state, keys, grading choice or window', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await t.close(s.teacherId, promptId);
    const attempts = [
      `update pad_prompts set state = 'revealed', revealed_at = now(), ungraded = true where id = $1`,
      `update pad_prompts set correct_keys = '{A}' where id = $1`,
      `update pad_prompts set ungraded = true where id = $1`,
      `update pad_prompts set closed_at = now() - interval '1 hour' where id = $1`,
      `update pad_prompts set opened_at = now() - interval '1 hour' where id = $1`,
    ];
    for (const sql of attempts) {
      await expect(t.rows(sql, [promptId])).rejects.toThrow(/only through the teacher transition functions/);
    }
  });

  it('refuses a direct prompt insert', async () => {
    const s = await liveSession();
    await expect(
      t.rows(`insert into pad_prompts (session_id, sequence, answer_type, option_count) values ($1, 99, 'mcq', 4)`, [s.sessionId]),
    ).rejects.toThrow(/created only by pad_ask/);
  });

  it('refuses a direct response insert and any response update, including is_correct', async () => {
    const s = await liveSession(2);
    const promptId = await openPrompt(s);
    await expect(
      t.rows(
        `insert into pad_responses (prompt_id, student_id, raw_answer, norm_answer) values ($1, $2, 'A', 'A')`,
        [promptId, s.students[1]],
      ),
    ).rejects.toThrow(/created only by pad_submit/);

    await t.submit(s.students[0], promptId, 'A');
    await expect(t.rows(`update pad_responses set is_correct = true where prompt_id = $1`, [promptId])).rejects.toThrow(
      /responses are immutable/,
    );
    await expect(t.rows(`update pad_responses set norm_answer = 'B' where prompt_id = $1`, [promptId])).rejects.toThrow(
      /responses are immutable/,
    );
  });

  it('refuses a response change even inside a reveal-flagged transaction when it is not is_correct', async () => {
    const s = await liveSession(1);
    const promptId = await openPrompt(s);
    await t.submit(s.students[0], promptId, 'A');
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query(`select set_config('pad.transition', 'reveal', true)`);
        await tx.query(`update pad_responses set raw_answer = 'B' where prompt_id = $1`, [promptId]);
      }),
    ).rejects.toThrow(/responses are immutable/);
  });

  it('enforces one open prompt per session at the index level', async () => {
    const s = await liveSession();
    await openPrompt(s);
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query(`select set_config('pad.transition', 'ask', true)`);
        await tx.query(`insert into pad_prompts (session_id, sequence, answer_type, option_count) values ($1, 2, 'mcq', 4)`, [
          s.sessionId,
        ]);
      }),
    ).rejects.toThrow(/pad_prompts_one_open/);
  });

  it('enforces no key while OPEN at the constraint level', async () => {
    const s = await liveSession();
    const promptId = await openPrompt(s);
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query(`select set_config('pad.transition', 'set_key', true)`);
        await tx.query(`update pad_prompts set correct_keys = '{A}' where id = $1`, [promptId]);
      }),
    ).rejects.toThrow(/pad_prompts_no_key_while_open/);
  });
});

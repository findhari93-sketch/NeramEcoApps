// @vitest-environment node
/**
 * Formula answers (migration 20261109090000): a numerical answer typed as a
 * formula is stored and graded by its value. The routes work the value out
 * (formulaValue); these tests pass what they would, and run the real SQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formulaValue } from '../formula-value';
import { PadTestDb, type ClassFixture } from './test-harness';

let t: PadTestDb;

beforeAll(async () => {
  t = await PadTestDb.create();
}, 120_000);

afterAll(async () => {
  await t?.dispose();
});

interface Live extends ClassFixture {
  sessionId: string;
}

async function live(students = 4): Promise<Live> {
  const fixture = await t.classWithStudents(students);
  const started = await t.start(fixture.teacherId, fixture.classroomId);
  expect(started).toMatchObject({ ok: true });
  return { ...fixture, sessionId: started.session_id };
}

async function askNumeric(s: Live, suggestedKeys: string[] | null = null, answerType = 'numeric'): Promise<string> {
  const asked = await t.ask(s.teacherId, s.sessionId, answerType, null, { suggestedKeys });
  expect(asked).toMatchObject({ ok: true, changed: true });
  return asked.prompt_id as string;
}

/** What the submit route sends: the answer as typed, and its value when it is a formula. */
const submit = (student: string, promptId: string, raw: string) => t.submit(student, promptId, raw, formulaValue(raw));

async function graded(promptId: string): Promise<Record<string, boolean | null>> {
  const rows = await t.rows(`select raw_answer, is_correct from pad_responses where prompt_id = $1`, [promptId]);
  return Object.fromEntries(rows.map((row) => [row.raw_answer as string, row.is_correct as boolean | null]));
}

describe('a formula answer', () => {
  it('is stored as its value and keeps what the student typed', async () => {
    const s = await live(1);
    const promptId = await askNumeric(s);
    const result = await submit(s.students[0], promptId, '2√3');
    expect(result).toMatchObject({ ok: true, status: 'accepted', answer: '3.46410161514', raw_answer: '2√3' });
  });

  it('is the same answer however it is written, so a rewrite is not a change', async () => {
    const s = await live(1);
    const promptId = await askNumeric(s);
    await submit(s.students[0], promptId, '2√3');
    expect(await submit(s.students[0], promptId, '2*sqrt(3)')).toMatchObject({ ok: true, status: 'unchanged' });
  });

  it('is still refused when it is not a number, and a value is ignored on a text question', async () => {
    const s = await live(1);
    const promptId = await askNumeric(s);
    expect(await submit(s.students[0], promptId, '2:3')).toMatchObject({ ok: false, code: 'INVALID_ANSWER' });
    await t.close(s.teacherId, promptId);

    const textPrompt = await askNumeric(s, null, 'text');
    expect(await t.submit(s.students[0], textPrompt, '3/4', '0.75')).toMatchObject({ ok: true, answer: '3/4' });
  });
});

describe('Reveal with a formula key from the question bank', () => {
  it('grades by value, taking a decimal correct to two places', async () => {
    const s = await live(4);
    const promptId = await askNumeric(s, [formulaValue('2√3')!]);
    await submit(s.students[0], promptId, '2√3');
    await submit(s.students[1], promptId, '3.46');
    await submit(s.students[2], promptId, '3.47');
    await submit(s.students[3], promptId, '2*sqrt(3)');
    await t.close(s.teacherId, promptId);
    expect(await t.reveal(s.teacherId, promptId)).toMatchObject({ ok: true, changed: true });

    expect(await graded(promptId)).toEqual({ '2√3': true, '3.46': true, '3.47': false, '2*sqrt(3)': true });
  });

  it('keeps a key keyed as a decimal exact, as before', async () => {
    const s = await live(2);
    const promptId = await askNumeric(s, ['3.46']);
    await submit(s.students[0], promptId, '3.46');
    await submit(s.students[1], promptId, '3.464');
    await t.close(s.teacherId, promptId);
    await t.reveal(s.teacherId, promptId);
    expect(await graded(promptId)).toEqual({ '3.46': true, '3.464': false });
  });
});

describe('a teacher typing a formula as the key', () => {
  it('is taken by value, and correcting it after Reveal regrades', async () => {
    const s = await live(2);
    const promptId = await askNumeric(s);
    await submit(s.students[0], promptId, '0.75');
    await submit(s.students[1], promptId, '1.57');
    await t.close(s.teacherId, promptId);

    expect(await t.setKey(s.teacherId, promptId, ['3/4'], false, [formulaValue('3/4')])).toMatchObject({ ok: true, changed: true });
    await t.reveal(s.teacherId, promptId);
    expect(await graded(promptId)).toEqual({ '0.75': true, '1.57': false });

    expect(await t.setKey(s.teacherId, promptId, ['π/2'], false, [formulaValue('π/2')])).toMatchObject({ ok: true, changed: true });
    expect(await graded(promptId)).toEqual({ '0.75': false, '1.57': true });
  });

  it('is refused when it is not a number, and on a question that is not numerical', async () => {
    const s = await live(1);
    const promptId = await askNumeric(s);
    await t.close(s.teacherId, promptId);
    expect(await t.setKey(s.teacherId, promptId, ['2:3'], false, [formulaValue('2:3')])).toMatchObject({ ok: false, code: 'INVALID_KEY' });
    expect(await t.setKey(s.teacherId, promptId, ['12'])).toMatchObject({ ok: true, changed: true });

    const mcq = await t.ask(s.teacherId, s.sessionId, 'mcq', 4);
    await t.close(s.teacherId, mcq.prompt_id as string);
    expect(await t.setKey(s.teacherId, mcq.prompt_id as string, ['3/4'], false, ['0.75'])).toMatchObject({ ok: false, code: 'INVALID_KEY' });
  });
});

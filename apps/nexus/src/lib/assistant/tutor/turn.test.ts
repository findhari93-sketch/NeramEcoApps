// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateGemini: vi.fn(), loadAiAccess: vi.fn() }));
vi.mock('../ai-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
}));
vi.mock('@neram/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/ai')>()),
  generateGemini: mocks.generateGemini,
}));

import { ApiError } from '@/lib/api-errors';
import { fakeDb } from '../testing/fake-db';
import { checksumSource } from './pack';
import { sha256 } from './store';
import { NOT_READY, TEST_OPEN, readAction, runTutorTurn } from './turn';
import type { TutorAction, TutorEnvelope } from './types';
import { MCQ_PACK, MCQ_QUESTION } from './testing/fixtures';

const QID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-06T05:00:00Z');
const student = { id: 's1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };

function seed(over: { pack?: Record<string, unknown>; tests?: unknown[]; question?: Record<string, unknown> } = {}) {
  const q = { id: QID, ...MCQ_QUESTION, difficulty: 'MEDIUM', section: 'math_mcq', repeat_group_id: null, is_active: true, status: 'active', ...over.question };
  return fakeDb({
    nexus_qb_questions: [q],
    nexus_qb_tutor_packs: [{ id: 'pk1', question_id: QID, status: 'verified', pack: MCQ_PACK, source_checksum: sha256(checksumSource(MCQ_QUESTION)), ...over.pack }],
    nexus_test_attempts: (over.tests as any[]) ?? [],
    nexus_concepts: [
      { id: 'c-dot', slug: 'vector_algebra.dot_product', label: 'Dot product', chapter_tag_id: 't1' },
      { id: 'c-comp', slug: 'vector_algebra.components', label: 'Components of a vector', chapter_tag_id: 't1' },
    ],
    nexus_student_concept_mastery: [{ student_id: 's1', concept_id: 'c-comp', state: 'STRONG', score: 0.8, evidence_n: 4, independent_n: 3, hard_independent_n: 0, last_result: 'correct', last_error_code: null }],
    nexus_qb_student_attempts: [],
    nexus_settings: [{ key: 'assistant_ai_daily_limit', value: 10 }],
  }, { unique: { nexus_assistant_messages: [['thread_id', 'external_id']] } });
}

let n = 0;
const turn = (db: ReturnType<typeof fakeDb>, action: TutorAction, extra: Record<string, unknown> = {}) =>
  runTutorTurn({ supabase: db, caller: student, questionId: QID, action, clientMessageId: `m${++n}`, now: NOW, ...extra });

beforeEach(() => {
  mocks.generateGemini.mockReset();
  mocks.loadAiAccess.mockReset().mockResolvedValue({ on: true, sentence: 'on', link: null });
});

describe('runTutorTurn', () => {
  it('starts, guides and checks a step, writing session, mastery, events and a hidden transcript', async () => {
    const db = seed();
    const first = await turn(db, { type: 'start' });
    expect(first.phase).toBe('attempt');
    await turn(db, { type: 'guide_me' });
    const out = await turn(db, { type: 'choose', stepId: 's1', choiceId: 'c1' });
    expect(out.blocks.find((b) => b.kind === 'verdict')).toMatchObject({ result: 'correct' });
    expect(out.progress).toEqual({ step: 2, total: 2 });

    const [session] = db.rows('nexus_tutor_sessions');
    expect(session).toMatchObject({ phase: 'guided', seq: 3, student_id: 's1' });
    expect(db.rows('nexus_student_concept_mastery').find((r) => r.concept_id === 'c-dot')).toMatchObject({ evidence_n: 1, state: 'INTRODUCED' });
    expect(db.rows('nexus_learning_events').map((e) => e.kind)).toContain('CONCEPT_TAUGHT');
    expect(db.rows('nexus_assistant_threads')[0].external_id).toBe(`tutor:${QID}`);
    expect(db.rows('nexus_assistant_messages').every((m) => m.mode === 'tutor' && m.llm === false)).toBe(true);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('a resend with the same client id returns the first reply and runs nothing twice', async () => {
    const db = seed();
    await turn(db, { type: 'start' });
    const a = await runTutorTurn({ supabase: db, caller: student, questionId: QID, action: { type: 'hint' }, clientMessageId: 'same', now: NOW });
    const b = await runTutorTurn({ supabase: db, caller: student, questionId: QID, action: { type: 'hint' }, clientMessageId: 'same', now: NOW });
    expect(b).toEqual(a);
    expect(db.rows('nexus_tutor_sessions')[0].hints_used).toBe(1);
  });

  it('refuses during an open test, and when there is no live pack', async () => {
    await expect(turn(seed({ tests: [{ id: 't', student_id: 's1', status: 'in_progress' }] }), { type: 'start' })).rejects.toMatchObject({ message: TEST_OPEN, status: 409 });
    await expect(turn(seed({ pack: { status: 'draft' } }), { type: 'start' })).rejects.toMatchObject({ message: NOT_READY, status: 404 });
    await expect(turn(seed({ question: { section: 'aptitude' } }), { type: 'start' })).rejects.toBeInstanceOf(ApiError);
  });

  it('an edited key retires the pack without touching it', async () => {
    await expect(turn(seed({ question: { correct_answer: 'b' } }), { type: 'start' })).rejects.toMatchObject({ status: 404 });
  });

  it('the first action of a new session is always start', async () => {
    const out = await turn(seed(), { type: 'show_solution' });
    expect(out.blocks[0].kind).toBe('concept_chips');
  });

  it('calls the model only for words the rules cannot place, and counts it as an AI answer', async () => {
    const db = seed();
    await turn(db, { type: 'start' });
    await turn(db, { type: 'guide_me' });
    await turn(db, { type: 'choose', stepId: 's1', choiceId: 'c1' });
    mocks.generateGemini.mockResolvedValue({
      text: JSON.stringify({ intent: 'answer', extracted_value: '-1', mistake_code: null, reply: '' }),
      model: 'gemini-2.5-flash-lite', usage: { promptTokens: 200, outputTokens: 20, totalTokens: 220 }, costUsd: 0.00002,
      keyTier: 'paid', functionCalls: [], modelParts: [], finishReason: 'STOP',
    });
    const out: TutorEnvelope = await turn(db, { type: 'answer', text: 'two take away three gives minus one' });
    expect(out.llm).toBe(true);
    expect(out.blocks.find((b) => b.kind === 'verdict')).toMatchObject({ result: 'correct' });
    const ai = db.rows('nexus_assistant_messages').filter((m) => m.llm);
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ role: 'assistant', model: 'gemini-2.5-flash-lite' });
  });

  it('viewing as a student records no mastery, events or saved items', async () => {
    const db = seed();
    const viewer = { ...student, impersonating: true };
    await turn(db, { type: 'start' }, { caller: viewer });
    await turn(db, { type: 'guide_me' }, { caller: viewer });
    const out = await turn(db, { type: 'choose', stepId: 's1', choiceId: 'c1' }, { caller: viewer });
    const saved = await turn(db, { type: 'save', ref: 'formula:s1' }, { caller: viewer });
    expect(out.blocks.some((b) => b.kind === 'verdict')).toBe(true);
    expect(db.rows('nexus_learning_events')).toHaveLength(0);
    expect(db.rows('nexus_learning_items')).toHaveLength(0);
    expect(db.rows('nexus_student_concept_mastery')).toHaveLength(1);
    expect(saved.blocks.at(-1)).toMatchObject({ md: expect.stringMatching(/nothing is saved/) });
  });

  it('saves a shown formula to My Learning once', async () => {
    const db = seed();
    await turn(db, { type: 'start' });
    await turn(db, { type: 'guide_me' });
    await turn(db, { type: 'choose', stepId: 's1', choiceId: 'c1' });
    await turn(db, { type: 'save', ref: 'formula:s1' });
    const items = db.rows('nexus_learning_items');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'formula', source_ref: 'formula:s1', concept_ids: ['c-dot'], chapter_tag_id: 't1' });
  });
});

describe('readAction', () => {
  it('keeps known actions and drops anything else', () => {
    expect(readAction({ type: 'hint', extra: 1 })).toEqual({ type: 'hint' });
    expect(readAction({ type: 'choose', stepId: 's1', choiceId: 'c1' })).toEqual({ type: 'choose', stepId: 's1', choiceId: 'c1' });
    expect(readAction({ type: 'choose', stepId: 's1' })).toBeNull();
    expect(readAction({ type: 'answer', text: '   ' })).toBeNull();
    expect(readAction({ type: 'delete_everything' })).toBeNull();
    expect(readAction(null)).toBeNull();
  });
});

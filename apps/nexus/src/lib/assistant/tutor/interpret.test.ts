// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateGemini: vi.fn(), loadAiAccess: vi.fn() }));
vi.mock('@/lib/assistant/ai-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
}));
vi.mock('../ai-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
}));
vi.mock('@neram/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/ai')>()),
  generateGemini: mocks.generateGemini,
}));

import { AiBlockedError } from '@neram/ai';
import { fakeDb } from '../testing/fake-db';
import { BUSY_REPLY, IMPERSONATING_REPLY, PAUSED_REPLY, limitReply } from '../llm';
import { buildTutorState, interpretReply, parseInterpretation, type InterpretInput } from './interpret';
import { MCQ_PACK } from './testing/fixtures';

const NOW = new Date('2026-10-06T05:00:00Z');
const student = { id: 's1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const db = (limit: unknown = 10) => fakeDb({ nexus_settings: [{ key: 'assistant_ai_daily_limit', value: limit }] });

const input = (over: Partial<InterpretInput> = {}): InterpretInput => ({
  supabase: db(), caller: student, now: NOW, purpose: 'interpret', text: 'two minus three',
  questionText: 'Find a.b', step: MCQ_PACK.steps[1], hintsUsed: 1, lastStudent: ['why'], stepMastery: 'DEVELOPING', ...over,
});

const reply = (json: unknown) => ({
  text: JSON.stringify(json), model: 'gemini-2.5-flash-lite', usage: { promptTokens: 200, outputTokens: 40, totalTokens: 240 },
  costUsd: 0.00003, keyTier: 'paid', functionCalls: [], modelParts: [], finishReason: 'STOP',
});

beforeEach(() => {
  mocks.generateGemini.mockReset();
  mocks.loadAiAccess.mockReset().mockResolvedValue({ on: true, sentence: 'AI answers: on.', link: null });
});

describe('interpretReply', () => {
  it('reads an answer and returns usage for the allowance count', async () => {
    mocks.generateGemini.mockResolvedValue(reply({ intent: 'answer', extracted_value: '-1', mistake_code: null, reply: '' }));
    const out = await interpretReply(input());
    expect(out.result).toEqual({ intent: 'answer', extractedValue: '-1', mistakeCode: null, reply: '' });
    expect(out.meta).toMatchObject({ model: 'gemini-2.5-flash-lite', promptTokens: 200, outputTokens: 40 });
    const call = mocks.generateGemini.mock.calls[0][0];
    expect(call).toMatchObject({ feature: 'nexus.tutor-interpret', actorId: 's1', responseMimeType: 'application/json' });
  });

  it('never calls the model while viewing as a student', async () => {
    const out = await interpretReply(input({ caller: { ...student, impersonating: true } }));
    expect(out.result).toEqual({ unavailable: IMPERSONATING_REPLY });
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('says the access rule sentence when AI answers are off for this student', async () => {
    mocks.loadAiAccess.mockResolvedValue({ on: false, sentence: 'Catch up on Monday first.', link: null });
    expect((await interpretReply(input())).result).toEqual({ unavailable: 'Catch up on Monday first.' });
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('stops at the daily allowance and at an admin pause', async () => {
    expect((await interpretReply(input({ supabase: db(0) }))).result).toEqual({ unavailable: limitReply(0) });
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('turns budget blocks and failures into sentences', async () => {
    mocks.generateGemini.mockRejectedValueOnce(new AiBlockedError({ message: 'Monthly cap reached', reason: 'monthly_cap' as any, feature: 'nexus.tutor-interpret', supportsManual: false, manualPrompt: null }));
    expect((await interpretReply(input())).result).toEqual({ unavailable: PAUSED_REPLY });
    mocks.generateGemini.mockRejectedValueOnce(new Error('network'));
    expect((await interpretReply(input())).result).toEqual({ unavailable: BUSY_REPLY });
    mocks.generateGemini.mockResolvedValueOnce(reply('not json at all'));
    expect((await interpretReply(input())).result).toEqual({ unavailable: BUSY_REPLY });
  });
});

describe('buildTutorState', () => {
  it('holds the open step only: no later step, no final answer, no choice flags', () => {
    const state = JSON.stringify(buildTutorState(input({ step: MCQ_PACK.steps[0] })));
    // Compare in the same JSON escaping, or a LaTeX backslash makes every "not contained" pass for free.
    const json = (t: string) => JSON.stringify(t).slice(1, -1);
    expect(state).toContain(json(MCQ_PACK.steps[0].ask));
    expect(state).not.toContain(json(MCQ_PACK.steps[1].ask));
    expect(state).not.toContain(json(MCQ_PACK.final.md));
    expect(state).not.toMatch(/"correct"|feedback/);
    expect(state).not.toContain('Priya');
  });
});

describe('parseInterpretation', () => {
  it('drops unknown codes and intents, strips em dashes', () => {
    expect(parseInterpretation(JSON.stringify({ intent: 'why', mistake_code: 'MADE_UP', reply: 'It works \u2014 because' }))).toEqual({
      intent: 'why', extractedValue: null, mistakeCode: null, reply: 'It works, because',
    });
    expect(parseInterpretation(JSON.stringify({ intent: 'grade', reply: 'x' }))).toBeNull();
  });
});

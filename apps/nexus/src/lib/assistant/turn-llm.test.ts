// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateGemini: vi.fn(), getStudentPrimaryClassroom: vi.fn(), loadUpcomingClasses: vi.fn(), loadDeclinedClassIds: vi.fn(), loadAiAccess: vi.fn() }));
vi.mock('@/lib/assistant/ai-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
}));
vi.mock('@neram/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/ai')>()),
  generateGemini: mocks.generateGemini,
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
}));
vi.mock('@/lib/upcoming-classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upcoming-classes')>()),
  loadUpcomingClasses: mocks.loadUpcomingClasses,
  loadDeclinedClassIds: mocks.loadDeclinedClassIds,
  istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }),
}));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () => ({}),
}));

import { AiBlockedError, type GeminiResult } from '@neram/ai';
import { fakeDb } from './testing/fake-db';
import { BUSY_REPLY, IMPERSONATING_REPLY, PAUSED_REPLY, limitReply } from './llm';
import { registerTools, TOOLS } from './registry';
import { runAssistantTurn } from './turn';
import type { AssistantCaller } from './types';

const student: AssistantCaller = { id: 's1', name: 'Priya Sundar', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ON = { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true };
const UNIQUE = { nexus_assistant_messages: [['thread_id', 'external_id']] };
const NOW = new Date('2026-10-03T04:30:00Z');
const upcoming = [{ id: 'k1', title: 'Perspective', classroom_id: 'c1', scheduled_date: '2026-10-04', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null }];

const answer = (text: string, over: Partial<GeminiResult> = {}): GeminiResult => ({
  text, model: 'gemini-2.5-flash-lite', usage: { promptTokens: 300, outputTokens: 60, totalTokens: 360 }, costUsd: 0.00005,
  keyTier: 'paid', functionCalls: [], modelParts: [], finishReason: 'STOP', ...over,
});

function turn(db: ReturnType<typeof fakeDb>, text: string, extra: Record<string, unknown> = {}) {
  return runAssistantTurn({ supabase: db, caller: student, channel: 'nexus', text, baseUrl: 'https://nexus.test', now: NOW, features: ON, ...extra });
}

// One exam tool fixture, so exam mode has something to declare.
if (!TOOLS.some((t) => t.name === 'fixture_exam_tool')) {
  registerTools([{ name: 'fixture_exam_tool', description: 'Exam fixture.', parameters: { type: 'object', properties: { exam: { type: 'string' } } }, audience: 'student', kind: 'read', mode: 'exam', run: async () => ({ ok: true, reply: 'Calculus is asked every year.' }) }]);
}

beforeEach(() => {
  mocks.generateGemini.mockReset();
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', name: 'Batch Alpha 2027', sketchbook_weekly_goal: 3, batch_id: null });
  mocks.loadUpcomingClasses.mockReset().mockResolvedValue(upcoming);
  mocks.loadDeclinedClassIds.mockReset().mockResolvedValue(new Set());
  mocks.loadAiAccess.mockReset().mockResolvedValue({ on: true, reason: 'caught_up', sentence: 'AI answers: on.', link: null, missed: [], missedCount: 0, deficit: 0, override: null });
});

describe('stage 4: free questions', () => {
  it('with AI answers off, replies with the reason and the Catch-up link, and never calls the model', async () => {
    mocks.loadAiAccess.mockResolvedValueOnce({
      on: false, reason: 'missed_class', sentence: 'AI answers are off. Catch up on Perspective (1 Oct) to switch them back on.',
      link: { label: 'Catch-up', url: '/student/catch-up' }, missed: [{ title: 'Perspective', day: '1 Oct' }], missedCount: 1, deficit: 0, override: null,
    });
    const db = fakeDb({});
    const env = await turn(db, 'tell me a fun fact about architecture');
    expect(env.reply).toBe('AI answers are off. Catch up on Perspective (1 Oct) to switch them back on.');
    expect(env.links).toEqual([{ label: 'Catch-up', url: '/student/catch-up' }]);
    expect(env.llm).toBeFalsy();
    expect(mocks.generateGemini).not.toHaveBeenCalled();
    expect(db.rows('nexus_assistant_messages').find((m) => m.role === 'assistant')?.llm).toBe(false);
  });

  it('the deterministic paths ignore AI access entirely', async () => {
    mocks.loadAiAccess.mockResolvedValue({ on: false, reason: 'teacher_off', sentence: 'off', link: null, missed: [], missedCount: 0, deficit: 0, override: null });
    const env = await turn(fakeDb({}), 'when is my next class');
    expect(env.reply).toMatch(/^Your next classes:/);
    expect(mocks.loadAiAccess).not.toHaveBeenCalled();
  });

  it('answers with the model, stores usage on the reply, marks the envelope llm', async () => {
    mocks.generateGemini.mockResolvedValueOnce(answer('Rest well before the exam and revise **formulas**.'));
    const db = fakeDb({}, { unique: UNIQUE });
    const env = await turn(db, 'any tips for staying calm before an exam day');
    expect(env).toMatchObject({ reply: 'Rest well before the exam and revise formulas.', llm: true, mode: 'general' });
    const stored = db.rows('nexus_assistant_messages').find((m) => m.role === 'assistant')!;
    expect(stored).toMatchObject({ llm: true, model: 'gemini-2.5-flash-lite', prompt_tokens: 300, output_tokens: 60 });
    const call = mocks.generateGemini.mock.calls[0][0];
    expect(call.feature).toBe('nexus.assistant-student');
    expect(call.systemInstruction).toMatch(/Priya/);
    expect(call.clientKey).toMatch(/^[0-9a-f]{32}$/);
    expect(call.maxOutputTokens).toBe(400);
  });

  it('declares read tools only: no action tool ever reaches the model (D1)', async () => {
    mocks.generateGemini.mockResolvedValueOnce(answer('ok'));
    await turn(fakeDb({}), 'tell me something about my week please');
    const names = (mocks.generateGemini.mock.calls[0][0].tools?.[0]?.functionDeclarations || []).map((d: { name: string }) => d.name);
    expect(names).toContain('my_schedule');
    for (const n of ['decline_class', 'declare_away_window', 'set_reminder', 'add_sketch']) expect(names).not.toContain(n);
  });

  it('answers "No such tool" when the model calls a tool it was not given, and proposes nothing (Review Focus 3)', async () => {
    mocks.generateGemini
      .mockResolvedValueOnce(answer('', { functionCalls: [{ name: 'decline_class', args: { class_id: 'k1', reason_code: 'unwell' } }, { name: 'my_sketchbook', args: {} }] }))
      .mockResolvedValueOnce(answer('Tap "I can\'t attend a class" below to tell your teacher.'));
    const db = fakeDb({});
    const env = await turn(db, 'i am sick and want to skip tomorrow ok', { features: { ...ON, sketchbook: false } });
    const sent = mocks.generateGemini.mock.calls[1][0].contents.at(-1).parts.map((p: any) => p.functionResponse.response);
    expect(sent).toEqual([{ ok: false, error: 'No such tool.' }, { ok: false, error: 'No such tool.' }]);
    expect(env.action).toBeNull();
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
  });

  it('exam mode: exam feature, no name, no classroom, no general turn in the request (Review Focus 1)', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const first = await turn(db, 'when is my next class'); // deterministic, mentions Perspective
    mocks.generateGemini.mockResolvedValueOnce(answer('Integration by parts: integral of u dv = uv minus integral of v du.'));
    const env = await turn(db, 'explain the integration by parts formula', { threadId: first.threadId });
    const call = mocks.generateGemini.mock.calls[0][0];
    expect(call.feature).toBe('nexus.assistant-exam');
    expect(call.maxOutputTokens).toBe(700);
    expect(env.mode).toBe('exam');
    expect(call.systemInstruction).not.toMatch(/Priya|Sundar|Batch Alpha/);
    expect(JSON.stringify(call.contents)).not.toMatch(/Perspective|next class/);
    const names = call.tools[0].functionDeclarations.map((d: { name: string }) => d.name);
    expect(names).toEqual(expect.arrayContaining(['fixture_exam_tool']));
    expect(names).not.toContain('my_schedule');
  });

  it('a failed read before the model answers BUSY_REPLY, stores the reply and does not throw (D4)', async () => {
    mocks.loadAiAccess.mockRejectedValueOnce(new Error('db down'));
    const db = fakeDb({});
    const env = await turn(db, 'tell me a fun fact about architecture');
    expect(env.reply).toBe(BUSY_REPLY);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
    expect(db.rows('nexus_assistant_messages').filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('exam text with the question bank off runs as a general turn on the student feature', async () => {
    mocks.generateGemini.mockResolvedValueOnce(answer('Integration by parts: integral of u dv = uv minus integral of v du.'));
    const db = fakeDb({});
    const env = await turn(db, 'explain the integration by parts formula', { features: { ...ON, questionBank: false } });
    expect(mocks.generateGemini.mock.calls[0][0].feature).toBe('nexus.assistant-student');
    expect(env.mode).toBe('general');
  });

  it('stores reply_to on the model answer, naming the user message it answers', async () => {
    mocks.generateGemini.mockResolvedValueOnce(answer('Fine.'));
    const db = fakeDb({});
    await turn(db, 'tell me a fun fact about architecture');
    const [u, a] = db.rows('nexus_assistant_messages');
    expect(a.reply_to).toBe(u.id);
  });

  it('stops at the admin-set daily allowance without calling the model (default 10)', async () => {
    const thread = { id: 't9', user_id: 's1', channel: 'nexus', last_message_at: '2026-10-03T03:00:00Z', flow_state: null, page_context: null };
    const replies = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, thread_id: 't9', role: 'assistant', llm: true, text: 'x', created_at: '2026-10-03T03:00:00Z' }));
    const db = fakeDb({ nexus_assistant_threads: [thread], nexus_assistant_messages: replies });
    const env = await turn(db, 'tell me a fun fact about architecture');
    expect(env.reply).toBe(limitReply(10));
    expect(limitReply(10)).toBe("You have used today's 10 AI questions. They reset at midnight. The buttons below still work.");
    expect(env.llm).toBeFalsy();
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('an allowance of 0 pauses AI answers for everyone', async () => {
    const db = fakeDb({ nexus_settings: [{ key: 'assistant_ai_daily_limit', value: 0 }] });
    expect((await turn(db, 'tell me a fun fact about architecture')).reply).toBe(limitReply(0));
    expect(limitReply(0)).toBe(PAUSED_REPLY);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('a paused feature, an hourly limit and a Gemini failure each become a plain reply, stored (Review Focus 4)', async () => {
    const blocked = (reason: any, message: string) => new AiBlockedError({ message, reason, feature: 'nexus.assistant-student', supportsManual: false, manualPrompt: null });
    mocks.generateGemini
      .mockRejectedValueOnce(blocked('feature_off', 'off'))
      .mockRejectedValueOnce(blocked('client_cap', 'You have asked a lot of questions in the last hour. Please try again shortly.'))
      .mockRejectedValueOnce(new Error('Gemini API 429: rate limit reached on all models'));
    const db = fakeDb({});
    expect((await turn(db, 'tell me about famous architects one')).reply).toBe(PAUSED_REPLY); // admin set the feature to Off at /teacher/admin/ai-usage
    expect((await turn(db, 'tell me about famous architects two')).reply).toBe('You have asked a lot of questions in the last hour. Please try again shortly.');
    const env = await turn(db, 'tell me about famous architects three');
    expect(env.reply).toBe(BUSY_REPLY);
    expect(env.suggestions.length).toBeGreaterThan(0);
    const roles = db.rows('nexus_assistant_messages').map((m) => m.role);
    expect(roles.filter((r) => r === 'assistant')).toHaveLength(3);
  });

  it('a tool that throws is reported to the model as a failed lookup, not a crash', async () => {
    registerTools([{ name: 'fixture_broken_tool', description: 'Broken.', parameters: { type: 'object', properties: {} }, audience: 'student', kind: 'read', run: async () => { throw new Error('db down'); } }]);
    mocks.generateGemini
      .mockResolvedValueOnce(answer('', { functionCalls: [{ name: 'fixture_broken_tool', args: {} }] }))
      .mockResolvedValueOnce(answer('I could not check that right now.'));
    const env = await turn(fakeDb({}), 'please check the broken thing for me');
    expect(mocks.generateGemini.mock.calls[1][0].contents.at(-1).parts[0].functionResponse.response).toEqual({ ok: false, error: 'That lookup failed.' });
    expect(env.reply).toBe('I could not check that right now.');
    const i = TOOLS.findIndex((t) => t.name === 'fixture_broken_tool');
    TOOLS.splice(i, 1);
  });

  it('collects links from the tools the model used, at most three', async () => {
    mocks.generateGemini
      .mockResolvedValueOnce(answer('', { functionCalls: [{ name: 'my_schedule', args: {} }] }))
      .mockResolvedValueOnce(answer('Perspective is tomorrow at 6 pm.'));
    const env = await turn(fakeDb({}), 'is there anything happening in class soon for me');
    expect(env.links).toEqual([{ label: 'Timetable', url: '/student/timetable' }]);
  });

  it('View as Student never spends the student allowance: no access check, no model call', async () => {
    const db = fakeDb({});
    const env = await turn(db, 'tell me a fun fact about architecture', { caller: { ...student, impersonating: true } });
    expect(env.reply).toBe(IMPERSONATING_REPLY);
    expect(env.llm).toBeFalsy();
    expect(mocks.generateGemini).not.toHaveBeenCalled();
    expect(mocks.loadAiAccess).not.toHaveBeenCalled();
    expect(db.rows('nexus_assistant_messages').find((m) => m.role === 'assistant')?.llm).toBe(false);
  });

  it('on Teams the model gets at most three calls even if it keeps asking for a tool', async () => {
    mocks.generateGemini.mockResolvedValue(answer('', { functionCalls: [{ name: 'my_schedule', args: {} }] }));
    await turn(fakeDb({}), 'is there anything happening in class soon for me', { channel: 'teams' });
    expect(mocks.generateGemini).toHaveBeenCalledTimes(3);
  });
});

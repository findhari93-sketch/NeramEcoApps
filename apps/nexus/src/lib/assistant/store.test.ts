// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from './testing/fake-db';
import {
  appendMessage, countLlmRepliesToday, createAction, createReminder, createThread, findReplyToExternalId, findThreadByExternalId, findThreadForMessage,
  getAction, listMessages, listRemindersDue, touchThread, updateAction,
} from './store';

const UNIQUE = { nexus_assistant_messages: [['thread_id', 'external_id']] };

describe('threads and messages', () => {
  it('creates a thread and finds it again by external id', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const t = await createThread(db, { userId: 'u1', channel: 'teams', externalId: '19:abc' });
    expect(t.user_id).toBe('u1');
    expect(await findThreadByExternalId(db, 'u1', 'teams', '19:abc')).toMatchObject({ id: t.id });
    expect(await findThreadByExternalId(db, 'u2', 'teams', '19:abc')).toBeNull();
    expect(await findThreadByExternalId(db, 'u1', 'teams', null)).toBeNull();
  });

  it('findThreadForMessage never returns another student thread or another channel thread', async () => {
    const X = 'a1b2c3d4-0000-4000-8000-000000000001';
    const db = fakeDb({}, { unique: UNIQUE });
    const other = await createThread(db, { userId: 'B', channel: 'nexus' });
    const teams = await createThread(db, { userId: 'A', channel: 'teams' });
    await appendMessage(db, { threadId: other.id, role: 'user', text: 'hi', externalId: X });
    await appendMessage(db, { threadId: teams.id, role: 'user', text: 'hi', externalId: X });
    expect(await findThreadForMessage(db, 'A', 'nexus', X)).toBeNull();
    expect(await findThreadForMessage(db, 'A', 'teams', X)).toMatchObject({ id: teams.id });
  });

  it('appends messages in order and refuses a repeated external id', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const t = await createThread(db, { userId: 'u1', channel: 'nexus' });
    const a = await appendMessage(db, { threadId: t.id, role: 'user', text: 'hi', externalId: 'act-1' });
    const b = await appendMessage(db, { threadId: t.id, role: 'assistant', text: 'hello' });
    const dup = await appendMessage(db, { threadId: t.id, role: 'user', text: 'hi again', externalId: 'act-1' });
    expect(a.inserted && b.inserted).toBe(true);
    expect(dup.inserted).toBe(false);
    expect((await listMessages(db, t.id)).map((m) => m.text)).toEqual(['hi', 'hello']);
  });

  it('lists the most recent messages, oldest first, when there are more than the limit', async () => {
    const db = fakeDb({});
    const t = await createThread(db, { userId: 'u1', channel: 'nexus' });
    for (let i = 0; i < 60; i++) await appendMessage(db, { threadId: t.id, role: i % 2 ? 'assistant' : 'user', text: `m${i}` });
    const texts = (await listMessages(db, t.id, 50)).map((m) => m.text);
    expect(texts).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 10}`));
  });

  it('finds the reply whose reply_to is the asked row, not the next assistant row, and null when none was stored', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const t = await createThread(db, { userId: 'u1', channel: 'teams' });
    const u1 = await appendMessage(db, { threadId: t.id, role: 'user', text: 'one', externalId: 'act-1' });
    const u2 = await appendMessage(db, { threadId: t.id, role: 'user', text: 'two', externalId: 'act-2' });
    // A later reply to act-2 lands before the reply to act-1: order must not matter.
    await appendMessage(db, { threadId: t.id, role: 'assistant', text: 'reply two', replyTo: u2.row!.id });
    expect((await findReplyToExternalId(db, t.id, 'act-1')).reply).toBeNull();
    expect((await findReplyToExternalId(db, t.id, 'act-1')).asked?.id).toBe(u1.row!.id);
    await appendMessage(db, { threadId: t.id, role: 'assistant', text: 'reply one', replyTo: u1.row!.id });
    expect((await findReplyToExternalId(db, t.id, 'act-1')).reply?.text).toBe('reply one');
    expect((await findReplyToExternalId(db, t.id, 'act-2')).reply?.text).toBe('reply two');
    expect(await findReplyToExternalId(db, t.id, 'act-9')).toEqual({ asked: null, reply: null });
  });

  it('stores and clears flow state', async () => {
    const db = fakeDb({});
    const t = await createThread(db, { userId: 'u1', channel: 'nexus' });
    await touchThread(db, t.id, { flowState: { flow: 'remind-me', step: 'when' } });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toEqual({ flow: 'remind-me', step: 'when' });
    await touchThread(db, t.id, { flowState: null });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });
});

describe('actions and reminders', () => {
  it('round-trips an action', async () => {
    const db = fakeDb({});
    const a = await createAction(db, {
      threadId: null, userId: 'u1', kind: 'set_reminder', args: { due_on: '2026-10-04' },
      summary: 'Remind you tomorrow', fields: [{ label: 'When', value: 'tomorrow' }],
      confirmToken: 'tok', expiresAt: '2026-10-03T10:10:00.000Z',
    });
    expect(a.status).toBe('pending');
    await updateAction(db, a.id, { status: 'executed', result: { ok: true } });
    expect(await getAction(db, a.id)).toMatchObject({ status: 'executed', result: { ok: true } });
  });

  it('lists only the queued reminders due today (Ruling 24: M1 has no sent marker, so an older one would repeat forever)', async () => {
    const db = fakeDb({
      nexus_assistant_reminders: [
        { id: 'r1', user_id: 'u1', due_on: '2026-10-03', text: 'a', status: 'queued' },
        { id: 'r2', user_id: 'u1', due_on: '2026-10-01', text: 'b', status: 'queued' },
        { id: 'r3', user_id: 'u1', due_on: '2026-10-04', text: 'c', status: 'queued' },
        { id: 'r4', user_id: 'u1', due_on: '2026-10-02', text: 'd', status: 'sent' },
        { id: 'r5', user_id: 'u2', due_on: '2026-10-02', text: 'e', status: 'queued' },
      ],
    });
    const due = await listRemindersDue(db, 'u1', '2026-10-03');
    expect(due.map((r) => r.id)).toEqual(['r1']);
    const made = await createReminder(db, { userId: 'u1', threadId: null, dueOn: '2026-10-05', text: 'f', kind: 'free' });
    expect(made.status).toBe('queued');
  });
});

describe('countLlmRepliesToday', () => {
  const since = '2026-10-02T18:30:00.000Z';
  it("counts model answers since IST midnight across the student's threads, nothing else", async () => {
    const db = fakeDb({
      nexus_assistant_threads: [
        { id: 't1', user_id: 's1', channel: 'nexus', last_message_at: '2026-10-03T04:00:00Z' },
        { id: 't2', user_id: 's1', channel: 'teams', last_message_at: '2026-10-03T03:00:00Z' },
        { id: 't3', user_id: 'other', channel: 'nexus', last_message_at: '2026-10-03T04:00:00Z' },
      ],
      nexus_assistant_messages: [
        { id: 'a', thread_id: 't1', role: 'assistant', llm: true, created_at: '2026-10-03T04:00:00Z' },
        { id: 'b', thread_id: 't2', role: 'assistant', llm: true, created_at: '2026-10-03T03:00:00Z' },
        { id: 'c', thread_id: 't1', role: 'assistant', llm: false, created_at: '2026-10-03T04:01:00Z' },
        { id: 'd', thread_id: 't1', role: 'assistant', llm: true, created_at: '2026-10-02T18:29:00Z' }, // 23:59 IST yesterday
        { id: 'e', thread_id: 't3', role: 'assistant', llm: true, created_at: '2026-10-03T04:00:00Z' },
      ],
    });
    expect(await countLlmRepliesToday(db, 's1', since)).toBe(2);
  });

  it('looks at the newest threads first, so a long tail of old ones cannot hide today', async () => {
    const old = Array.from({ length: 200 }, (_, i) => ({ id: `old${i}`, user_id: 's1', channel: 'nexus', last_message_at: `2026-10-03T0${i % 3}:00:00Z` }));
    const db = fakeDb({
      nexus_assistant_threads: [...old, { id: 'fresh', user_id: 's1', channel: 'nexus', last_message_at: '2026-10-03T09:00:00Z' }],
      nexus_assistant_messages: [{ id: 'a', thread_id: 'fresh', role: 'assistant', llm: true, created_at: '2026-10-03T09:00:00Z' }],
    });
    expect(await countLlmRepliesToday(db, 's1', since)).toBe(1);
  });

  it('stores model, tokens, cost and tool calls on a model answer', async () => {
    const db = fakeDb({});
    await appendMessage(db, { threadId: 't1', role: 'assistant', text: 'x', llm: true, mode: 'exam', model: 'gemini-2.5-flash-lite', promptTokens: 120, outputTokens: 40, costUsd: 0.00003, toolCalls: [{ name: 'qb_chapter_weightage', args: { exam: 'NATA' }, ok: true }] });
    expect(db.rows('nexus_assistant_messages')[0]).toMatchObject({ llm: true, model: 'gemini-2.5-flash-lite', prompt_tokens: 120, output_tokens: 40, cost_usd: 0.00003, tool_calls: [{ name: 'qb_chapter_weightage' }] });
  });
});

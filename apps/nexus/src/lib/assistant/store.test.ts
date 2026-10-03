// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from './testing/fake-db';
import {
  appendMessage, createAction, createReminder, createThread, findThreadByExternalId,
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

  it('lists queued reminders due today or earlier, oldest first', async () => {
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
    expect(due.map((r) => r.id)).toEqual(['r2', 'r1']);
    const made = await createReminder(db, { userId: 'u1', threadId: null, dueOn: '2026-10-05', text: 'f', kind: 'free' });
    expect(made.status).toBe('queued');
  });
});

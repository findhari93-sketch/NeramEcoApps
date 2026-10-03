// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './testing/fake-db';
import { TOOLS, registerTools } from './registry';
import type { ActionToolDef, AssistantCaller, ToolContext } from './types';
import { ACTION_TTL_MS, cancelAction, confirmAction, proposeAction } from './actions';

const executed: unknown[] = [];
const reminderTool: ActionToolDef<{ due_on: string; text: string }> = {
  name: 'set_reminder',
  description: 'Store a reminder',
  parameters: { type: 'object', properties: {}, required: [] },
  audience: 'student',
  kind: 'action',
  run: async () => ({ ok: true }),
  execute: async (_ctx, args) => {
    executed.push(args);
    return {
      ok: true,
      reply: `Done. I will remind you on ${args.due_on}.`,
      links: [{ label: 'My catch-up', url: 'https://nexus.test/student/catch-up' }],
    };
  },
};

const student: AssistantCaller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };

function ctxFor(db: ReturnType<typeof fakeDb>, caller = student, now = new Date('2026-10-03T10:00:00Z')): ToolContext {
  return { caller, channel: 'nexus', mode: 'general', supabase: db, classroomId: 'c1', threadId: null, now, baseUrl: 'https://nexus.test' };
}

beforeEach(() => {
  TOOLS.length = 0;
  registerTools([reminderTool as unknown as ActionToolDef]);
  executed.length = 0;
});

describe('proposeAction', () => {
  it('stores a pending row with a token and a 10 minute expiry', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), {
      kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish' },
      summary: 'Remind you tomorrow to finish', fields: [{ label: 'When', value: 'tomorrow' }],
    });
    expect(p.confirmToken).toHaveLength(36);
    expect(p.expiresAt).toBe(new Date(Date.parse('2026-10-03T10:00:00Z') + ACTION_TTL_MS).toISOString());
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ user_id: 'u1', status: 'pending', kind: 'set_reminder' });
  });

  it('refuses an unknown kind before writing anything', async () => {
    const db = fakeDb({});
    await expect(proposeAction(ctxFor(db), { kind: 'launch_rocket', args: {}, summary: 's', fields: [] })).rejects.toThrow(/Unknown action/);
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
  });
});

describe('confirmAction', () => {
  async function pending(db: ReturnType<typeof fakeDb>) {
    return proposeAction(ctxFor(db), { kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish' }, summary: 's', fields: [] });
  }

  it('executes once and records the result', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(out).toMatchObject({ ok: true, reply: 'Done. I will remind you on 2026-10-04.' });
    expect(executed).toHaveLength(1);
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ status: 'executed', result: { ok: true } });
    const again = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(executed).toHaveLength(1);
  });

  it('refuses another student, a wrong token, and an unknown id', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    expect(await confirmAction(ctxFor(db, { ...student, id: 'u2' }), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 403 });
    expect(await confirmAction(ctxFor(db), { id: p.id, token: 'nope' })).toMatchObject({ ok: false, status: 403 });
    expect(await confirmAction(ctxFor(db), { id: 'missing', token: 'x' })).toMatchObject({ ok: false, status: 404 });
    expect(executed).toHaveLength(0);
  });

  it('expires after ten minutes and marks the row', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    const later = new Date(Date.parse('2026-10-03T10:00:00Z') + ACTION_TTL_MS + 1);
    expect(await confirmAction(ctxFor(db, student, later), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 410 });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('expired');
  });

  it('refuses while impersonating, even with the right token', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    expect(await confirmAction(ctxFor(db, { ...student, impersonating: true }), { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 403 });
    expect(executed).toHaveLength(0);
  });

  it('marks failed when the tool throws, and says nothing changed', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    vi.spyOn(reminderTool, 'execute').mockRejectedValueOnce(new Error('db down'));
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(out).toMatchObject({ ok: false, status: 500 });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('failed');
  });
});

describe('cancelAction', () => {
  it('cancels a pending action of the owner only', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    expect(await cancelAction(ctxFor(db, { ...student, id: 'u2' }), { id: p.id })).toMatchObject({ ok: false, status: 403 });
    expect(await cancelAction(ctxFor(db), { id: p.id })).toMatchObject({ ok: true });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('cancelled');
  });
});

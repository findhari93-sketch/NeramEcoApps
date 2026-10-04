// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDb } from './testing/fake-db';
import { TOOLS, registerTools } from './registry';
import type { ActionToolDef, AssistantCaller, ToolContext } from './types';
import { ACTION_TTL_MS, cancelAction, confirmAction, proposeAction } from './actions';
import { setReminder } from './tools/actions/set-reminder';

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
  return { caller, channel: 'nexus', mode: 'general', supabase: db, classroomId: 'c1', threadId: null, now, baseUrl: 'https://nexus.test', features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true } };
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

  it('executes once when two confirms race, and the loser gets 409', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    const [a, b] = await Promise.all([
      confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken }),
      confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken }),
    ]);
    expect(executed).toHaveLength(1);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.find((o) => !o.ok)).toMatchObject({ ok: false, status: 409, error: 'That action was already handled.' });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('executed');
  });

  it('passes the action thread into execute and returns it', async () => {
    const db = fakeDb({});
    const seen: Array<string | null> = [];
    vi.spyOn(reminderTool, 'execute').mockImplementationOnce(async (ctx) => {
      seen.push(ctx.threadId);
      return { ok: true, reply: 'Done.' };
    });
    const p = await proposeAction({ ...ctxFor(db), threadId: 't-9' }, { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(seen).toEqual(['t-9']);
    expect(out).toMatchObject({ ok: true, threadId: 't-9' });
  });

  it('marks failed when the tool throws, and never claims nothing changed (a write may have landed)', async () => {
    const db = fakeDb({});
    const p = await pending(db);
    vi.spyOn(reminderTool, 'execute').mockRejectedValueOnce(new Error('db down'));
    const out = await confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken });
    expect(out).toEqual({ ok: false, status: 500, error: 'Something went wrong while doing that. Check the page before trying again.' });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('failed');
  });

  it('re-checks with the tool before executing: a reminder for today confirmed after midnight IST is refused (item 8)', async () => {
    TOOLS.length = 0;
    registerTools([setReminder as unknown as ActionToolDef]);
    const db = fakeDb({});
    const execute = vi.spyOn(setReminder, 'execute');
    // 23:55 IST on 3 Oct: the card is for "today".
    const before = new Date('2026-10-03T18:25:00Z');
    const p = await proposeAction(ctxFor(db, student, before), { kind: 'set_reminder', args: { due_on: '2026-10-03', text: 'finish the sheet' }, summary: 's', fields: [] });
    // 00:01 IST on 4 Oct, still inside the ten minutes.
    const after = new Date('2026-10-03T18:31:00Z');
    const out = await confirmAction(ctxFor(db, student, after), { id: p.id, token: p.confirmToken });
    expect(out).toEqual({ ok: false, status: 400, error: 'That day has already passed. Which day should I remind you?' });
    expect(execute).not.toHaveBeenCalled();
    expect(db.rows('nexus_assistant_reminders')).toHaveLength(0);
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ status: 'failed', result: { error: 'That day has already passed. Which day should I remind you?' } });
    execute.mockRestore();
  });

  it('refuses an action whose feature was switched off after the card was made (Ruling 25)', async () => {
    const sketchTool = { ...reminderTool, name: 'add_sketch', feature: 'sketchbook' as const };
    TOOLS.length = 0;
    registerTools([sketchTool as unknown as ActionToolDef]);
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'add_sketch', args: {}, summary: 's', fields: [] });
    const off = { ...ctxFor(db), features: { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true } };
    expect(await confirmAction(off, { id: p.id, token: p.confirmToken })).toMatchObject({ ok: false, status: 400 });
    expect(executed).toHaveLength(0);
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('failed');
  });
});

describe('cancelAction', () => {
  it('cancels a pending action of the owner only, and invites asking again', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    expect(await cancelAction(ctxFor(db, { ...student, id: 'u2' }), { id: p.id })).toMatchObject({ ok: false, status: 403 });
    expect(await cancelAction(ctxFor(db), { id: p.id })).toMatchObject({ ok: true, reply: 'Okay, cancelled. Nothing was changed. Ask me again whenever you want it set up differently.' });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('cancelled');
  });

  it('cancels with a conditional update: of two racing cancels, one wins and the other gets 409 (item 9)', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    const [a, b] = await Promise.all([cancelAction(ctxFor(db), { id: p.id }), cancelAction(ctxFor(db), { id: p.id })]);
    expect([a, b].filter((o) => o.ok)).toHaveLength(1);
    expect([a, b].find((o) => !o.ok)).toEqual({ ok: false, status: 409, error: 'That action was already handled.' });
  });

  it('a cancel that loses to a confirm gets 409 and leaves the action executed', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    const [confirmed, cancelled] = await Promise.all([
      confirmAction(ctxFor(db), { id: p.id, token: p.confirmToken }),
      cancelAction(ctxFor(db), { id: p.id }),
    ]);
    expect(confirmed).toMatchObject({ ok: true });
    expect(cancelled).toMatchObject({ ok: false, status: 409 });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('executed');
  });

  it('refuses to cancel while impersonating and leaves the action pending', async () => {
    const db = fakeDb({});
    const p = await proposeAction(ctxFor(db), { kind: 'set_reminder', args: {}, summary: 's', fields: [] });
    expect(await cancelAction(ctxFor(db, { ...student, impersonating: true }), { id: p.id })).toEqual({ ok: false, status: 403, error: 'Viewing as a student is read only.' });
    expect(db.rows('nexus_assistant_actions')[0].status).toBe('pending');
  });
});

/**
 * The celebrate route remembers who it congratulated.
 *
 * Staging has no absences to make anyone all clear, so the round trip cannot be
 * exercised end to end there. These pin the three things that stop a teacher
 * naming the same students again: a post writes a 'teams' row per named
 * student, a mark writes 'marked' rows without touching Teams, and an undo can
 * only ever delete 'marked' rows.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ table: string; op: string; args: any[] }> = [];
let insertError: { message: string } | null = null;

function builder(table: string) {
  const state: { op: string } = { op: 'select' };
  const record = (op: string, args: any[]) => calls.push({ table, op, args });
  const result = () => {
    if (table === 'users' && state.op === 'select') {
      return { data: [{ id: 'poheem', ms_oid: 'oid-p' }], error: null };
    }
    if (table === 'nexus_catchup_celebrations' && state.op === 'insert') {
      return insertError
        ? { data: null, error: insertError }
        : { data: [{ id: 'cel-1' }], error: null };
    }
    if (table === 'nexus_catchup_celebrations' && state.op === 'delete') {
      return { data: [{ id: 'cel-1' }], error: null };
    }
    return { data: null, error: null };
  };
  const b: any = {
    select: (...a: any[]) => (record('select', a), b),
    eq: (...a: any[]) => (record('eq', a), b),
    in: (...a: any[]) => (record('in', a), b),
    insert: (...a: any[]) => ((state.op = 'insert'), record('insert', a), b),
    delete: (...a: any[]) => ((state.op = 'delete'), record('delete', a), b),
    maybeSingle: async () => {
      if (table === 'users') return { data: { id: 'teacher-1', user_type: 'teacher' }, error: null };
      if (table === 'nexus_classrooms') {
        return { data: { id: 'room-1', ms_team_id: 'team-1', ms_group_chat_id: null }, error: null };
      }
      return { data: null, error: null };
    },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: async () => ({ oid: 'teacher-oid' }),
  extractBearerToken: (h: string | null) => (h ? h.replace(/^Bearer\s+/, '') : null),
}));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => true }));
vi.mock('@/lib/catchup-cohort', () => ({
  loadAllClearStudents: async () => [
    {
      id: 'poheem',
      name: 'Poheem',
      email: null,
      avatar_url: null,
      standing: { clearedTotal: 1, lastClearedAt: '2026-09-09T10:00:00+05:30' },
    },
    {
      id: 'humaira',
      name: 'Humaira',
      email: null,
      avatar_url: null,
      standing: { clearedTotal: 2, lastClearedAt: '2026-09-09T09:00:00+05:30' },
    },
  ],
}));
const postChannel = vi.fn(async () => ({ id: 'msg-1' }));
vi.mock('@/lib/teams-class-announcements', () => ({
  buildMentions: (people: any[]) => ({ html: people.map((p) => p.displayName).join(', '), mentions: [] }),
  escapeMessageHtml: (s: string) => s,
  isPostError: (r: any) => 'error' in r,
  postChannelMessageDetailed: (...a: any[]) => postChannel(...(a as [])),
  postChatMessageDetailed: async () => ({ error: 'no chat' }),
  resolveMeetingChannelId: async () => 'channel-1',
}));

import { POST } from './route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/catchup/celebrate', {
    method: 'POST',
    headers: { Authorization: 'Bearer real-ms-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const inserts = () =>
  calls.filter((c) => c.table === 'nexus_catchup_celebrations' && c.op === 'insert');

beforeEach(() => {
  calls.length = 0;
  insertError = null;
  postChannel.mockClear();
});

describe('POST /api/catchup/celebrate', () => {
  it('records a teams row for each named student, with the standing snapshot and message id', async () => {
    const res = await POST(req({ classroomId: 'room-1', studentIds: ['poheem'], postToTeams: 'channel' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.named).toEqual(['Poheem']);
    expect(body.recorded).toBe(true);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].args[0]).toEqual([
      {
        classroom_id: 'room-1',
        student_id: 'poheem',
        celebrated_by: 'teacher-1',
        source: 'teams',
        cleared_total: 1,
        last_cleared_at: '2026-09-09T10:00:00+05:30',
        teams_channel_message_id: 'msg-1',
        teams_group_chat_message_id: null,
      },
    ]);
  });

  it('still reports the post as sent when the record fails, so nobody presses again', async () => {
    insertError = { message: 'relation does not exist' };
    const res = await POST(req({ classroomId: 'room-1', studentIds: ['poheem'], postToTeams: 'channel' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.recorded).toBe(false);
  });

  it('marks without posting, and only students who are clear right now', async () => {
    const res = await POST(
      req({ classroomId: 'room-1', mode: 'mark', studentIds: ['humaira', 'someone-behind'] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(postChannel).not.toHaveBeenCalled();
    expect(body.named).toEqual(['Humaira']);
    expect(body.celebrationIds).toEqual(['cel-1']);
    const rows = inserts()[0].args[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: 'humaira', source: 'marked', cleared_total: 2 });
  });

  it('surfaces a failed mark instead of pretending it saved', async () => {
    insertError = { message: 'relation does not exist' };
    const res = await POST(req({ classroomId: 'room-1', mode: 'mark', studentIds: ['humaira'] }));
    expect(res.status).toBe(500);
  });

  it('undo deletes only marked rows in this classroom', async () => {
    const res = await POST(req({ classroomId: 'room-1', mode: 'unmark', celebrationIds: ['cel-1'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(1);

    const filters = calls
      .filter((c) => c.table === 'nexus_catchup_celebrations' && (c.op === 'eq' || c.op === 'in'))
      .map((c) => c.args);
    expect(filters).toContainEqual(['id', ['cel-1']]);
    expect(filters).toContainEqual(['classroom_id', 'room-1']);
    expect(filters).toContainEqual(['source', 'marked']);
  });

  it('rejects a mode it does not know', async () => {
    const res = await POST(req({ classroomId: 'room-1', mode: 'broadcast' }));
    expect(res.status).toBe(400);
  });
});

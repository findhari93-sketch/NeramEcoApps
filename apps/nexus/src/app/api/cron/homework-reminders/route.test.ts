// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The evening run behind "every 3 days until they hand it in". What matters:
 *  - a student who handed it in is ended, never reminded, even on a due day;
 *  - a due plan is claimed before sending, and a lost claim sends nothing;
 *  - the repeat comes from Neram Assistant with no teacher's name on it;
 *  - a dry run decides and writes nothing.
 */

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  plans: [] as any[],
  sendNudge: vi.fn(),
  claim: vi.fn(),
  end: vi.fn(),
  channel: vi.fn(),
  record: vi.fn(),
  loadClassWork: vi.fn(),
}));

function builder(table: string) {
  const b: any = {};
  for (const m of ['select', 'eq', 'in', 'is', 'lte', 'order', 'limit']) b[m] = () => b;
  b.then = (resolve: (v: unknown) => void) => resolve({ data: mocks.tables[table] ?? [], error: null });
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  istTodayYmd: () => '2026-09-27',
  recordAssignmentReminder: mocks.record,
}));
vi.mock('@/lib/cron-auth', () => ({ assertCronRequest: () => null }));
vi.mock('@/lib/class-work', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/class-work')>()),
  loadClassWork: mocks.loadClassWork,
}));
vi.mock('@/lib/homework-reminder-store', () => ({
  loadActivePlans: async () => mocks.plans,
  claimSend: mocks.claim,
  endPlan: mocks.end,
  recordChannel: mocks.channel,
}));
vi.mock('@/lib/nudge-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nudge-delivery')>()),
  sendNudge: mocks.sendNudge,
}));

import { GET } from './route';

const run = (q = '') => GET(new NextRequest(`http://localhost:3022/api/cron/homework-reminders${q}`));

function plan(student: string, next_on = '2026-09-27') {
  return {
    id: `plan-${student}`,
    scheduled_class_id: 'class-1',
    classroom_id: 'room-1',
    student_id: student,
    every_days: 3,
    started_by: 'teacher-1',
    next_on,
    sends: 1,
    last_sent_at: null,
    ended_at: null,
    end_reason: null,
  };
}

beforeEach(() => {
  mocks.plans = [plan('owes'), plan('done'), plan('later', '2026-09-29'), plan('paused'), plan('gone')];
  mocks.tables = {
    nexus_scheduled_classes: [{ id: 'class-1', title: 'Basic 3D shapes', scheduled_date: '2026-09-15', classroom_id: 'room-1' }],
    nexus_enrollments: [
      { user_id: 'owes', participation_status: 'active' },
      { user_id: 'done', participation_status: 'active' },
      { user_id: 'later', participation_status: 'active' },
      { user_id: 'paused', participation_status: 'dormant' },
    ],
  };
  mocks.loadClassWork.mockReset().mockResolvedValue({
    assignments: [{ id: 'hw-1', title: 'Perspective study', timing: 'homework', due_at: null }],
    subs: new Map([['hw-1:done', [{ assignment_id: 'hw-1', student_id: 'done', submitted_at: '2026-09-26', status: 'submitted' }]]]),
  });
  mocks.claim.mockReset().mockResolvedValue(true);
  mocks.end.mockReset().mockResolvedValue(undefined);
  mocks.channel.mockReset().mockResolvedValue(undefined);
  mocks.record.mockReset().mockResolvedValue(undefined);
  mocks.sendNudge.mockReset().mockImplementation(async (input: any) => ({
    results: input.studentIds.map((id: string) => ({ studentId: id, name: null, chat: true, teams: false, inapp: true, ok: true, channel: 'chat+inapp' })),
    counts: { total: input.studentIds.length, chat: input.studentIds.length, teams: 0, inapp: input.studentIds.length, failed: 0, skipped: 0, unreached: 0 },
  }));
});

describe('GET /api/cron/homework-reminders', () => {
  it('reminds the one who is due and still owes it, as the Assistant, and ends the rest correctly', async () => {
    const body = await (await run()).json();
    expect(body).toMatchObject({ plans: 5, sent: 1, ended: 2, waiting: 2 });

    expect(mocks.end).toHaveBeenCalledWith(expect.anything(), 'plan-done', 'handed_in');
    expect(mocks.end).toHaveBeenCalledWith(expect.anything(), 'plan-gone', 'left');
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'plan-owes' }), '2026-09-27', '2026-09-30');

    const [input] = mocks.sendNudge.mock.calls[0];
    expect(input.studentIds).toEqual(['owes']);
    expect(input.teacher).toBeUndefined();
    expect(input.sendAs).toBeUndefined();
    expect(input.assistant.link.url).toContain('/student/assignments/hw-1');
    expect(input.plain).toContain('is still not handed in');
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ student_id: 'owes', sent_by: null, template: 'homework_auto' }));
    expect(mocks.channel).toHaveBeenCalledWith(expect.anything(), 'plan-owes', 'chat+inapp');
  });

  it('sends nothing when another run already claimed the day', async () => {
    mocks.claim.mockResolvedValue(false);
    const body = await (await run()).json();
    expect(body.skippedClaim).toBe(1);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it('decides without writing or sending on a dry run', async () => {
    const body = await (await run('?dryRun=1')).json();
    expect(body.wouldSend).toEqual([{ planId: 'plan-owes', studentId: 'owes', classId: 'class-1' }]);
    expect(mocks.end).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });
});

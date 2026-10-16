import { afterEach, describe, expect, it, vi } from 'vitest';

const updateDemoRequest = vi.fn();
const enqueueDemoMessages = vi.fn();
const enqueueDemoStaffMessages = vi.fn();
const logDemoRequestEvent = vi.fn();
const createDemoEvent = vi.fn();

vi.mock('@neram/database', () => ({
  updateDemoRequest: (...a: unknown[]) => updateDemoRequest(...a),
  enqueueDemoMessages: (...a: unknown[]) => enqueueDemoMessages(...a),
  enqueueDemoStaffMessages: (...a: unknown[]) => enqueueDemoStaffMessages(...a),
  logDemoRequestEvent: (...a: unknown[]) => logDemoRequestEvent(...a),
  cancelPendingDemoMessages: vi.fn(),
  staffUserIdsByUpn: async () => ({ 'haribabu@neramclasses.com': 'staff-hari' }),
  staffReminderPlan: () => [{ upn: 'haribabu@neramclasses.com', kind: 'staff_day', sendAfter: new Date() }],
  demoReminderPlan: () => [{ kind: 'confirmed', sendAfter: new Date() }],
  isOutsidePreference: () => false,
  formatDemoDateTime: () => 'Fri, 17 Oct at 5:00 PM',
  drawingWhatsAppLink: () => 'https://wa.me/x',
  pickDemoRoles: (_s: unknown, team: string[], p: { tutor?: string }) => ({ tutor: p.tutor || team[0], organizer: team[0] }),
}));
vi.mock('./teams', () => ({
  createDemoEvent: (...a: unknown[]) => createDemoEvent(...a),
  getTeamBusy: async () => ({}),
  overlapping: () => [],
  isDemoTeamsDryRun: () => true,
}));
vi.mock('./messages', () => ({ buildDemoInviteHtml: () => '<p/>', demoEventSubject: () => 'NERAM DEMO' }));

import { ConfirmError, confirmDemo, parseMeetingKind, type ConfirmInput } from './confirm';

const settings = {
  hosts: [{ upn: 'haribabu@neramclasses.com', name: 'Hari', notifyNewRequests: false }],
  schedule: { durationMinutes: 60 },
  drawingWhatsApp: '919176137043',
} as any;
const r = { id: 'req-1', status: 'contacted', name: 'Walk In', email: null, ref_code: 'DEMO-X', join_token: 't', preferred_date: null, preferred_window: 'anytime' } as any;
const input = (over: Partial<ConfirmInput>): ConfirmInput => ({
  start: new Date('2026-10-17T11:30:00Z'),
  minutes: 60,
  reason: null,
  teamUpns: [],
  tutorUpn: 'haribabu@neramclasses.com',
  organizerUpn: '',
  meeting: 'teams',
  joinUrl: null,
  conflictNote: null,
  ...over,
});
const run = (over: Partial<ConfirmInput>) => confirmDemo({ supabase: {} as any, actorId: 'staff', r, settings, input: input(over), origin: 'https://neramclasses.com' });

afterEach(() => {
  vi.clearAllMocks();
});

describe('confirmDemo meeting kinds', () => {
  it('Teams creates the event and messages the student', async () => {
    createDemoEvent.mockResolvedValue({ joinUrl: 'https://teams.microsoft.com/x', eventId: 'ev1' });
    const res = await run({ meeting: 'teams' });
    expect(createDemoEvent).toHaveBeenCalledTimes(1);
    expect(enqueueDemoMessages).toHaveBeenCalledTimes(1);
    expect(updateDemoRequest.mock.calls[0][1]).toMatchObject({ status: 'approved', meeting_kind: 'teams', graph_event_id: 'ev1' });
    expect(res.sendNow).toBe(true);
  });

  it.each(['later', 'in_person'] as const)('%s: no Teams event, no student message, team reminders still queued', async (meeting) => {
    const res = await run({ meeting });
    expect(createDemoEvent).not.toHaveBeenCalled();
    expect(enqueueDemoMessages).not.toHaveBeenCalled();
    expect(enqueueDemoStaffMessages).toHaveBeenCalledTimes(1);
    expect(updateDemoRequest.mock.calls[0][1]).toMatchObject({ status: 'approved', meeting_kind: meeting, teams_join_url: null, graph_event_id: null });
    expect(res.sendNow).toBe(false);
  });

  it('own link needs the link', async () => {
    await expect(run({ meeting: 'own_link', joinUrl: null })).rejects.toBeInstanceOf(ConfirmError);
    const res = await run({ meeting: 'own_link', joinUrl: 'https://meet.google.com/abc' });
    expect(updateDemoRequest.mock.calls[0][1]).toMatchObject({ meeting_kind: 'own_link', teams_join_url: 'https://meet.google.com/abc' });
    expect(res.sendNow).toBe(false);
  });

  it('only a new or called request can be confirmed', async () => {
    await expect(
      confirmDemo({ supabase: {} as any, actorId: null, r: { ...r, status: 'approved' }, settings, input: input({}), origin: '' }),
    ).rejects.toThrow(/new or called/);
  });
});

describe('parseMeetingKind', () => {
  it('maps the old "link" value and defaults to teams', () => {
    expect(parseMeetingKind('link')).toBe('own_link');
    expect(parseMeetingKind('later')).toBe('later');
    expect(parseMeetingKind('zoom')).toBe('teams');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const updateDemoRequest = vi.fn();
const createDemoRequestWithRef = vi.fn();
const cancelPendingDemoMessages = vi.fn();
const logDemoRequestEvent = vi.fn();
const openDemoFollowUp = vi.fn();
const enqueueDemoMessages = vi.fn();

vi.mock('@neram/database', () => ({
  updateDemoRequest: (...a: unknown[]) => updateDemoRequest(...a),
  createDemoRequestWithRef: (...a: unknown[]) => createDemoRequestWithRef(...a),
  cancelPendingDemoMessages: (...a: unknown[]) => cancelPendingDemoMessages(...a),
  logDemoRequestEvent: (...a: unknown[]) => logDemoRequestEvent(...a),
  openDemoFollowUp: (...a: unknown[]) => openDemoFollowUp(...a),
  enqueueDemoMessages: (...a: unknown[]) => enqueueDemoMessages(...a),
  staffUserIdsByUpn: async () => ({ 'haribabu@neramclasses.com': 'staff-hari' }),
  thanksSendAfter: () => new Date('2026-10-15T12:00:00Z'),
  formatDemoDateTime: () => 'Thu, 15 Oct at 4:00 PM',
  istDateKey: () => '2026-10-15',
  rebookFollowUpAt: () => new Date('2026-10-16T05:30:00Z'),
}));
vi.mock('./server', () => ({ loadDemoSettings: vi.fn() }));

import { HeldDemoError, parseHeldDemo, recordHeldDemo } from './record-held';
import { DEFAULT_HELD_TUTOR, heldTutorOptions } from './staff-add';

const NOW = new Date('2026-10-15T12:00:00Z');
const TUTORS = ['haribabu@neramclasses.com', 'tamilselvan@neramclasses.com'];
const attendedBody = {
  heldAt: '2026-10-15T10:30:00Z',
  platform: 'google_meet',
  outcome: 'attended',
  interest: 'hot',
  nextFollowUpAt: '2026-10-17T05:30:00Z',
  note: 'Liked it',
};

const supabase = {
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
} as any;

afterEach(() => {
  vi.clearAllMocks();
});

describe('heldTutorOptions', () => {
  it('adds Haribabu when the team list does not have him', () => {
    expect(heldTutorOptions([{ upn: 'TamilSelvan@neramclasses.com', name: 'Tamil Selvan' }]).map((t) => t.upn)).toEqual([
      DEFAULT_HELD_TUTOR.upn,
      'tamilselvan@neramclasses.com',
    ]);
  });
  it('does not duplicate Haribabu', () => {
    expect(heldTutorOptions([{ upn: 'Haribabu@neramclasses.com', name: 'Hari' }])).toHaveLength(1);
  });
});

describe('parseHeldDemo', () => {
  it('defaults the tutor to Haribabu', () => {
    expect(parseHeldDemo(attendedBody, TUTORS, NOW).tutorUpn).toBe('haribabu@neramclasses.com');
  });
  it('takes a picked tutor from the team, case-insensitive', () => {
    expect(parseHeldDemo({ ...attendedBody, tutorUpn: 'TamilSelvan@neramclasses.com' }, TUTORS, NOW).tutorUpn).toBe(
      'tamilselvan@neramclasses.com',
    );
  });
  it('rejects a tutor outside the team', () => {
    expect(() => parseHeldDemo({ ...attendedBody, tutorUpn: 'x@y.com' }, TUTORS, NOW)).toThrow(HeldDemoError);
  });
  it('rejects a time in the future', () => {
    expect(() => parseHeldDemo({ ...attendedBody, heldAt: '2026-10-15T13:00:00Z' }, TUTORS, NOW)).toThrow(/future/);
  });
  it('needs interest and a future follow-up when attended', () => {
    expect(() => parseHeldDemo({ ...attendedBody, interest: undefined }, TUTORS, NOW)).toThrow(/interested/);
    expect(() => parseHeldDemo({ ...attendedBody, nextFollowUpAt: '2026-10-14T05:30:00Z' }, TUTORS, NOW)).toThrow(/future/);
  });
  it('a no-show needs no follow-up date', () => {
    const h = parseHeldDemo({ heldAt: attendedBody.heldAt, platform: 'phone', outcome: 'no_show' }, TUTORS, NOW);
    expect(h.attended).toBe(false);
    expect(h.nextAt).toBeNull();
  });
  it('drops a link that is not https', () => {
    expect(parseHeldDemo({ ...attendedBody, joinUrl: 'meet.google.com/abc' }, TUTORS, NOW).joinUrl).toBeNull();
  });
});

describe('recordHeldDemo', () => {
  const held = parseHeldDemo(attendedBody, TUTORS, NOW);

  it('closes an open request with the typed details and starts the post-demo follow-up', async () => {
    const existing = { id: 'req-1', status: 'contacted' } as any;
    updateDemoRequest.mockResolvedValue({ ...existing, status: 'attended' });
    const { row, queued } = await recordHeldDemo({
      supabase,
      actorId: 'staff-1',
      userId: 'user-1',
      held,
      minutes: 60,
      tutorName: 'Haribabu',
      existing,
      patch: { parent_name: 'Mother', account_holder: 'parent' },
      source: 'Recorded from the request.',
    });
    expect(row.status).toBe('attended');
    expect(queued).toBe(false);
    const patch = updateDemoRequest.mock.calls[0][1];
    expect(patch).toMatchObject({
      status: 'attended',
      attended: true,
      tutor_upn: 'haribabu@neramclasses.com',
      host_user_id: 'staff-hari',
      parent_name: 'Mother',
      account_holder: 'parent',
      next_contact_at: null,
      scheduled_start: '2026-10-15T10:30:00.000Z',
    });
    expect(cancelPendingDemoMessages).toHaveBeenCalledWith('req-1', undefined, supabase);
    expect(createDemoRequestWithRef).not.toHaveBeenCalled();
    expect(openDemoFollowUp.mock.calls[0][0]).toMatchObject({ kind: 'post_demo', userId: 'user-1', demoRegistrationId: 'req-1', interest: 'hot' });
    expect(logDemoRequestEvent.mock.calls[0][0].note).toContain('taken by Haribabu');
  });

  it('a no-show opens a rebook follow-up and can queue "we missed you"', async () => {
    const noShow = parseHeldDemo({ heldAt: attendedBody.heldAt, platform: 'phone', outcome: 'no_show', sendFollowUp: true }, TUTORS, NOW);
    createDemoRequestWithRef.mockResolvedValue({ id: 'req-2', status: 'no_show' });
    const { queued } = await recordHeldDemo({
      supabase,
      actorId: null,
      userId: 'user-2',
      held: noShow,
      minutes: 60,
      tutorName: 'Haribabu',
      existing: null,
      create: { user_id: 'user-2', name: 'Walk In', email: null, phone: '9876543210', current_class: null, parent_joining: false, parent_name: null, parent_phone: null, preferred_language: null },
      source: 'Added by staff.',
    });
    expect(createDemoRequestWithRef.mock.calls[0][0]).toMatchObject({ status: 'no_show', preferred_window: 'anytime', name: 'Walk In' });
    expect(openDemoFollowUp.mock.calls[0][0]).toMatchObject({ kind: 'demo_rebook' });
    expect(enqueueDemoMessages.mock.calls[0][1][0].kind).toBe('missed');
    expect(queued).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { DemoFollowUpRow, DemoRequest } from '@neram/database';
import {
  closedReason,
  enrolmentOf,
  groupByPerson,
  linkIsReallyPaid,
  linkIsUnfinalisedRecorded,
  meetingKindOf,
  saysJoinedNoFee,
  sortPeople,
  stageOf,
  type EnrolmentEvidence,
} from './journey';

const req = (over: Partial<DemoRequest>): DemoRequest =>
  ({
    id: 'r',
    user_id: 'u1',
    status: 'pending',
    phone: '9876543210',
    created_at: '2026-10-10T07:00:00Z',
    updated_at: '2026-10-10T07:00:00Z',
    scheduled_start: null,
    next_contact_at: null,
    teams_join_url: null,
    graph_event_id: null,
    meeting_kind: null,
    cancel_reason: null,
    rejection_reason: null,
    ...over,
  }) as DemoRequest;

const fu = (over: Partial<DemoFollowUpRow>): DemoFollowUpRow =>
  ({ id: 'f', status: 'scheduled', call_outcome: null, scheduled_callback_at: null, call_notes: null, ...over }) as DemoFollowUpRow;

describe('stageOf', () => {
  it('new and called requests are To call', () => {
    expect(stageOf(req({ status: 'pending' }), null, undefined)).toBe('to_call');
    expect(stageOf(req({ status: 'contacted' }), null, undefined)).toBe('to_call');
  });
  it('a confirmed demo is Scheduled', () => {
    expect(stageOf(req({ status: 'approved' }), null, undefined)).toBe('scheduled');
  });
  it('a finished demo stays After demo while its follow-up runs, or before it starts', () => {
    expect(stageOf(req({ status: 'attended' }), fu({ status: 'scheduled' }), undefined)).toBe('after_demo');
    expect(stageOf(req({ status: 'no_show' }), null, undefined)).toBe('after_demo');
  });
  it('a stopped follow-up is Closed; "joined" without a fee stays After demo', () => {
    const joined = fu({ status: 'completed', call_outcome: 'joined' });
    expect(stageOf(req({ status: 'attended' }), fu({ status: 'completed', call_outcome: 'not_interested' }), undefined)).toBe('closed');
    expect(stageOf(req({ status: 'attended' }), joined, undefined)).toBe('after_demo');
    expect(saysJoinedNoFee(joined, null)).toBe(true);
    expect(saysJoinedNoFee(joined, { kind: 'enrolled', on: '2026-10-18' })).toBe(false);
  });
  it('a recorded fee beats everything', () => {
    const enrolled = { kind: 'enrolled', on: '2026-10-18' } as const;
    expect(stageOf(req({ status: 'attended' }), fu({ status: 'scheduled' }), enrolled)).toBe('joined');
    expect(stageOf(req({ status: 'cancelled' }), null, enrolled)).toBe('joined');
  });
  it('fee_pending stays After demo (money entered, not finalised) and clears the "no fee" chip', () => {
    const feePending = { kind: 'fee_pending', on: '2026-10-20', linkId: 'l', amountPaid: 15000, finalFee: 30000 } as const;
    const joined = fu({ status: 'completed', call_outcome: 'joined' });
    expect(stageOf(req({ status: 'attended' }), joined, feePending)).toBe('after_demo');
    expect(saysJoinedNoFee(joined, feePending)).toBe(false);
  });
  it('a student from before the demo is not Enrolled', () => {
    expect(stageOf(req({ status: 'approved' }), null, { kind: 'student_before', since: '2026-03-29' })).toBe('scheduled');
  });
  it('rejected and cancelled are Closed', () => {
    expect(stageOf(req({ status: 'rejected' }), null, undefined)).toBe('closed');
    expect(stageOf(req({ status: 'cancelled' }), null, undefined)).toBe('closed');
  });
  it('Try later waits on the Later tab, then comes back to To call on its date', () => {
    const parked = req({ status: 'contacted', last_call_outcome: 'later', next_contact_at: '2026-11-23T04:30:00Z' });
    expect(stageOf(parked, null, undefined, new Date('2026-10-23T09:30:00Z'))).toBe('later');
    expect(stageOf(parked, null, undefined, new Date('2026-11-23T05:00:00Z'))).toBe('to_call');
    // An ordinary call-back is still To call.
    expect(stageOf(req({ status: 'contacted', last_call_outcome: 'call_back', next_contact_at: '2026-11-23T04:30:00Z' }), null, undefined, new Date('2026-10-23T09:30:00Z'))).toBe('to_call');
  });
});

describe('closedReason for Joined another class', () => {
  it('names it, whether logged on a call or when cancelling', () => {
    expect(closedReason(req({ status: 'rejected', last_call_outcome: 'joined_elsewhere', rejection_reason: 'Offline centre in Kerala' }), null)).toBe(
      'Joined another class: Offline centre in Kerala',
    );
    expect(closedReason(req({ status: 'cancelled', last_call_outcome: 'joined_elsewhere', cancel_reason: 'Joined XYZ' }), null)).toBe(
      'Joined another class: Joined XYZ',
    );
  });
});

describe('linkIsReallyPaid / linkIsUnfinalisedRecorded', () => {
  it('a used, verified, or payment-backed link is really paid', () => {
    expect(linkIsReallyPaid({ status: 'used' })).toBe(true);
    expect(linkIsReallyPaid({ status: 'active', verified_at: '2026-10-21T06:00:00Z' })).toBe(true);
    expect(linkIsReallyPaid({ status: 'active', verified_by: 'staff-1' })).toBe(true);
    expect(linkIsReallyPaid({ status: 'active', amount_paid: 15000 }, true)).toBe(true);
    expect(linkIsReallyPaid({ status: 'active', amount_paid: 15000 })).toBe(false);
    expect(linkIsReallyPaid(null)).toBe(false);
  });
  it('an active recorded link with a typed amount, not yet real, is unfinalised', () => {
    expect(linkIsUnfinalisedRecorded({ status: 'active', payment_mode: 'recorded', amount_paid: 15000 })).toBe(true);
    // payment_mode defaults to recorded when absent
    expect(linkIsUnfinalisedRecorded({ status: 'active', amount_paid: 15000 })).toBe(true);
  });
  it('is false for student-pays, zero amount, used, or a real payment', () => {
    expect(linkIsUnfinalisedRecorded({ status: 'active', payment_mode: 'student_pays', amount_paid: 15000 })).toBe(false);
    expect(linkIsUnfinalisedRecorded({ status: 'active', payment_mode: 'recorded', amount_paid: 0 })).toBe(false);
    expect(linkIsUnfinalisedRecorded({ status: 'used', payment_mode: 'recorded', amount_paid: 15000 })).toBe(false);
    expect(linkIsUnfinalisedRecorded({ status: 'active', payment_mode: 'recorded', amount_paid: 15000 }, true)).toBe(false);
  });
});

describe('enrolmentOf', () => {
  const asked = req({ id: 'jwq8', user_id: 'hari', created_at: '2026-10-19T17:17:43Z' });
  const none: EnrolmentEvidence = { profiles: {}, usedLinks: [], pendingLinks: [] };
  const pending = (over: Partial<EnrolmentEvidence['pendingLinks'][number]> = {}): EnrolmentEvidence['pendingLinks'][number] => ({
    demoId: 'jwq8',
    userId: 'hari',
    linkId: 'link-1',
    amountPaid: 15000,
    finalFee: 30000,
    createdAt: '2026-10-20T06:00:00Z',
    ...over,
  });

  it('DEMO-JWQ8: a profile from March is a student from before, not Enrolled', () => {
    const ev: EnrolmentEvidence = { profiles: { hari: { enrolledOn: '2026-03-29', createdAt: '2026-03-29T17:22:37Z' } }, usedLinks: [], pendingLinks: [] };
    expect(enrolmentOf(asked, ev)).toEqual({ kind: 'student_before', since: '2026-03-29' });
  });
  it('a finished enrolment link for this demo is Enrolled', () => {
    const ev: EnrolmentEvidence = { profiles: {}, usedLinks: [{ demoId: 'jwq8', userId: null, usedAt: '2026-10-21T06:00:00Z' }], pendingLinks: [] };
    expect(enrolmentOf(asked, ev)).toEqual({ kind: 'enrolled', on: '2026-10-21T06:00:00Z' });
  });
  it("the student's own link or profile after the request is Enrolled; before it is not", () => {
    const after: EnrolmentEvidence = { profiles: {}, usedLinks: [{ demoId: null, userId: 'hari', usedAt: '2026-10-22T06:00:00Z' }], pendingLinks: [] };
    expect(enrolmentOf(asked, after)?.kind).toBe('enrolled');
    const profile: EnrolmentEvidence = { profiles: { hari: { enrolledOn: '2026-10-22', createdAt: '2026-10-22T06:00:00Z' } }, usedLinks: [], pendingLinks: [] };
    expect(enrolmentOf(asked, profile)).toEqual({ kind: 'enrolled', on: '2026-10-22' });
    const before: EnrolmentEvidence = { profiles: {}, usedLinks: [{ demoId: null, userId: 'hari', usedAt: '2026-03-29T06:00:00Z' }], pendingLinks: [] };
    expect(enrolmentOf(asked, before)).toBeNull();
  });
  it('carries the fee glance from the profile cache onto an Enrolled result', () => {
    const fee = { agreed: 30000, paid: 15000, balance: 15000, nextDueDate: '2026-12-01' };
    const ev: EnrolmentEvidence = {
      profiles: { hari: { enrolledOn: '2026-10-22', createdAt: '2026-10-22T06:00:00Z', fee } },
      usedLinks: [{ demoId: 'jwq8', userId: 'hari', usedAt: '2026-10-21T06:00:00Z' }],
      pendingLinks: [],
    };
    expect(enrolmentOf(asked, ev)).toEqual({ kind: 'enrolled', on: '2026-10-21T06:00:00Z', fee });
  });
  it('an active recorded link with money is fee_pending (matched by demo, then by user)', () => {
    const byDemo: EnrolmentEvidence = { profiles: {}, usedLinks: [], pendingLinks: [pending()] };
    expect(enrolmentOf(asked, byDemo)).toEqual({ kind: 'fee_pending', on: '2026-10-20T06:00:00Z', linkId: 'link-1', amountPaid: 15000, finalFee: 30000 });
    const byUser: EnrolmentEvidence = { profiles: {}, usedLinks: [], pendingLinks: [pending({ demoId: null })] };
    expect(enrolmentOf(asked, byUser)?.kind).toBe('fee_pending');
  });
  it('a really paid link wins over a pending one', () => {
    const ev: EnrolmentEvidence = {
      profiles: {},
      usedLinks: [{ demoId: 'jwq8', userId: null, usedAt: '2026-10-21T06:00:00Z' }],
      pendingLinks: [pending()],
    };
    expect(enrolmentOf(asked, ev)?.kind).toBe('enrolled');
  });
  it('no profile and no link is nothing (a submitted payment waits for staff)', () => {
    expect(enrolmentOf(asked, none)).toBeNull();
    expect(enrolmentOf(req({ user_id: null }), none)).toBeNull();
  });
});

describe('groupByPerson', () => {
  it("Aamna: a cancelled first request folds under her live one", () => {
    const qen3 = req({ id: 'qen3', ref_code: 'DEMO-QEN3', status: 'cancelled', created_at: '2026-10-10T06:23:00Z' });
    const w4x8 = req({ id: 'w4x8', ref_code: 'DEMO-W4X8', status: 'contacted', created_at: '2026-10-10T07:08:00Z' });
    const people = groupByPerson([qen3, w4x8]);
    expect(people).toHaveLength(1);
    expect(people[0].current.id).toBe('w4x8');
    expect(people[0].history.map((r) => r.id)).toEqual(['qen3']);
  });
  it('a live older request wins over a newer closed one', () => {
    const live = req({ id: 'live', status: 'approved', created_at: '2026-10-01T00:00:00Z' });
    const closed = req({ id: 'closed', status: 'cancelled', created_at: '2026-10-05T00:00:00Z' });
    expect(groupByPerson([live, closed])[0].current.id).toBe('live');
  });
  it('rows without an account group by phone', () => {
    const a = req({ id: 'a', user_id: null, phone: '+91 98765 43210' });
    const b = req({ id: 'b', user_id: null, phone: '9876543210', created_at: '2026-10-11T00:00:00Z' });
    const c = req({ id: 'c', user_id: null, phone: '9000000000' });
    expect(groupByPerson([a, b, c])).toHaveLength(2);
  });
});

describe('sortPeople', () => {
  it('After demo: not started first, then the earliest due call', () => {
    const people = groupByPerson([
      req({ id: 'late', user_id: 'a', status: 'attended' }),
      req({ id: 'none', user_id: 'b', status: 'attended' }),
      req({ id: 'soon', user_id: 'c', status: 'attended' }),
    ]);
    const followUps = {
      late: fu({ scheduled_callback_at: '2026-10-20T05:30:00Z' }),
      soon: fu({ scheduled_callback_at: '2026-10-17T05:30:00Z' }),
    };
    expect(sortPeople('after_demo', people, followUps, {}).map((p) => p.current.id)).toEqual(['none', 'soon', 'late']);
  });
});

describe('meetingKindOf and closedReason', () => {
  it('derives the meeting kind for older rows', () => {
    expect(meetingKindOf(req({ graph_event_id: 'g', teams_join_url: 'https://teams' }))).toBe('teams');
    expect(meetingKindOf(req({ teams_join_url: 'https://meet.google.com/x' }))).toBe('own_link');
    expect(meetingKindOf(req({}))).toBe('later');
    expect(meetingKindOf(req({ meeting_kind: 'in_person' }))).toBe('in_person');
  });
  it('explains why it is closed', () => {
    expect(closedReason(req({ status: 'attended' }), fu({ status: 'completed', call_outcome: 'not_interested', call_notes: 'Reason: Fees. Will try next year' }))).toBe(
      'Follow-up stopped: Fees',
    );
    expect(closedReason(req({ status: 'cancelled', cancel_reason: 'Cancelled by the student: no time' }), null)).toBe('Cancelled by the student: no time');
    expect(closedReason(req({ status: 'rejected', rejection_reason: 'Wrong number' }), null)).toBe('Not interested: Wrong number');
  });
});

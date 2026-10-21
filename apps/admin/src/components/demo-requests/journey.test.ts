import { describe, expect, it } from 'vitest';
import type { DemoFollowUpRow, DemoRequest } from '@neram/database';
import { closedReason, enrolmentOf, groupByPerson, meetingKindOf, saysJoinedNoFee, sortPeople, stageOf } from './journey';

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
  it('a student from before the demo is not Enrolled', () => {
    expect(stageOf(req({ status: 'approved' }), null, { kind: 'student_before', since: '2026-03-29' })).toBe('scheduled');
  });
  it('rejected and cancelled are Closed', () => {
    expect(stageOf(req({ status: 'rejected' }), null, undefined)).toBe('closed');
    expect(stageOf(req({ status: 'cancelled' }), null, undefined)).toBe('closed');
  });
});

describe('enrolmentOf', () => {
  const asked = req({ id: 'jwq8', user_id: 'hari', created_at: '2026-10-19T17:17:43Z' });
  const none = { profiles: {}, usedLinks: [] };

  it('DEMO-JWQ8: a profile from March is a student from before, not Enrolled', () => {
    const ev = { profiles: { hari: { enrolledOn: '2026-03-29', createdAt: '2026-03-29T17:22:37Z' } }, usedLinks: [] };
    expect(enrolmentOf(asked, ev)).toEqual({ kind: 'student_before', since: '2026-03-29' });
  });
  it('a finished enrolment link for this demo is Enrolled', () => {
    const ev = { profiles: {}, usedLinks: [{ demoId: 'jwq8', userId: null, usedAt: '2026-10-21T06:00:00Z' }] };
    expect(enrolmentOf(asked, ev)).toEqual({ kind: 'enrolled', on: '2026-10-21T06:00:00Z' });
  });
  it("the student's own link or profile after the request is Enrolled; before it is not", () => {
    const after = { profiles: {}, usedLinks: [{ demoId: null, userId: 'hari', usedAt: '2026-10-22T06:00:00Z' }] };
    expect(enrolmentOf(asked, after)?.kind).toBe('enrolled');
    const profile = { profiles: { hari: { enrolledOn: '2026-10-22', createdAt: '2026-10-22T06:00:00Z' } }, usedLinks: [] };
    expect(enrolmentOf(asked, profile)).toEqual({ kind: 'enrolled', on: '2026-10-22' });
    const before = { profiles: {}, usedLinks: [{ demoId: null, userId: 'hari', usedAt: '2026-03-29T06:00:00Z' }] };
    expect(enrolmentOf(asked, before)).toBeNull();
  });
  it('no profile and no finished link is nothing (a submitted payment waits for staff)', () => {
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

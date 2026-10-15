import { describe, it, expect } from 'vitest';
import {
  applyFollowUpOutcome,
  firstFollowUpAt,
  rebookFollowUpAt,
  resolveFollowUpOwnerId,
  decideEnrolUser,
  buildOwnerDigest,
  buildManagerSummary,
  type DigestRow,
} from './demo-follow-up';

// 2026-10-15 10:00 IST
const NOW = new Date('2026-10-15T04:30:00Z');

describe('default dates', () => {
  it('first follow-up is 2 days later at 11:00 IST', () => {
    expect(firstFollowUpAt(NOW).toISOString()).toBe('2026-10-17T05:30:00.000Z');
  });
  it('rebook is next day at 11:00 IST', () => {
    expect(rebookFollowUpAt(NOW).toISOString()).toBe('2026-10-16T05:30:00.000Z');
  });
});

describe('applyFollowUpOutcome', () => {
  const next = '2026-10-20T12:30:00.000Z';
  it('thinking needs a next date and stays scheduled', () => {
    expect(applyFollowUpOutcome({ outcome: 'thinking', now: NOW, recent: [] })).toEqual({ error: 'Pick the next follow-up date.' });
    const r = applyFollowUpOutcome({ outcome: 'thinking', nextAt: next, now: NOW, recent: [] });
    expect(r).toMatchObject({ status: 'scheduled', scheduledAt: next, attemptOutcome: 'thinking', removeFlags: ['hard_to_reach'] });
  });
  it('will join uses the join date', () => {
    expect(applyFollowUpOutcome({ outcome: 'will_join', nextAt: next, now: NOW, recent: [] })).toMatchObject({ status: 'scheduled', scheduledAt: next });
  });
  it('no answer retries in 2 days and flags after 3 in a row', () => {
    const r1 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: [] });
    expect(r1).toMatchObject({ status: 'scheduled', scheduledAt: '2026-10-17T04:30:00.000Z', attemptOutcome: 'not_picked_up', addFlags: [] });
    const r3 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: ['not_picked_up', 'not_picked_up', 'thinking'] });
    expect(r3).toMatchObject({ addFlags: ['hard_to_reach'] });
    const r2 = applyFollowUpOutcome({ outcome: 'no_answer', now: NOW, recent: ['not_picked_up', 'thinking', 'not_picked_up'] });
    expect(r2).toMatchObject({ addFlags: [] });
  });
  it('not interested needs a reason and closes', () => {
    expect(applyFollowUpOutcome({ outcome: 'not_interested', now: NOW, recent: [] })).toEqual({ error: 'Add the reason so the team knows why.' });
    expect(applyFollowUpOutcome({ outcome: 'not_interested', reason: 'Fees', now: NOW, recent: [] })).toMatchObject({ status: 'completed', scheduledAt: null, attemptOutcome: 'not_interested' });
  });
  it('joined closes', () => {
    expect(applyFollowUpOutcome({ outcome: 'joined', now: NOW, recent: [] })).toMatchObject({ status: 'completed', attemptOutcome: 'joined', removeFlags: ['hard_to_reach', 'payment_pending'] });
  });
  it('rejects a next date in the past', () => {
    expect(applyFollowUpOutcome({ outcome: 'thinking', nextAt: '2026-10-14T05:00:00.000Z', now: NOW, recent: [] })).toEqual({ error: 'The next follow-up must be in the future.' });
  });
});

describe('resolveFollowUpOwnerId', () => {
  const staff = {
    'tamilselvan@neramclasses.com': { id: 't', active: true },
    'shanthimano@nerasmclasses.onmicrosoft.com': { id: 's', active: true },
    'haribabu@neramclasses.com': { id: 'h', active: true },
  };
  const order = ['tamilselvan@neramclasses.com', 'shanthimano@nerasmclasses.onmicrosoft.com'];
  it('CRM owner wins when active', () => {
    expect(resolveFollowUpOwnerId({ crmOwnerId: 'x', crmOwnerActive: true, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('x');
  });
  it('falls to the order, skipping disabled staff, then the manager', () => {
    expect(resolveFollowUpOwnerId({ crmOwnerId: 'x', crmOwnerActive: false, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('t');
    const tOff = { ...staff, 'tamilselvan@neramclasses.com': { id: 't', active: false } };
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: order, managerUpn: 'haribabu@neramclasses.com', staffByUpn: tOff })).toBe('s');
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: [], managerUpn: 'haribabu@neramclasses.com', staffByUpn: staff })).toBe('h');
    expect(resolveFollowUpOwnerId({ crmOwnerId: null, crmOwnerActive: false, ownerOrder: [], managerUpn: null, staffByUpn: staff })).toBeNull();
  });
});

describe('decideEnrolUser', () => {
  it('same user continues', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u1', signedInIsDisposable: false })).toEqual({ action: 'continue', userId: 'u1' });
  });
  it('a link with no user keeps the old behaviour', () => {
    expect(decideEnrolUser({ linkUserId: null, signedInUserId: 'u9', signedInIsDisposable: false })).toEqual({ action: 'continue', userId: 'u9' });
  });
  it('a fresh shell is merged into the demo account', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u2', signedInIsDisposable: true })).toEqual({ action: 'merge', userId: 'u1', mergeFrom: 'u2' });
  });
  it('another real account is refused', () => {
    expect(decideEnrolUser({ linkUserId: 'u1', signedInUserId: 'u2', signedInIsDisposable: false })).toEqual({
      action: 'refuse',
      message: 'Sign in with the number you used for your demo.',
    });
  });
});

describe('digests', () => {
  const rows: DigestRow[] = [
    { callback_id: 'c1', user_id: 'p1', person_name: 'Aamna Khan', person_phone: '+919967221751', due_at: '2026-10-14T05:30:00Z', interest_level: 'hot', owner_id: 't', query_type: 'post_demo', flags: [] },
    { callback_id: 'c2', user_id: 'p2', person_name: 'Priya', person_phone: '+919000000001', due_at: '2026-10-15T09:00:00Z', interest_level: 'warm', owner_id: 't', query_type: 'post_demo', flags: [] },
    { callback_id: 'c3', user_id: 'p3', person_name: 'Ravi', person_phone: null, due_at: '2026-10-15T11:00:00Z', interest_level: null, owner_id: 's', query_type: null, flags: [] },
  ];
  it('builds one digest per owner with overdue first', () => {
    const d = buildOwnerDigest(rows.filter((r) => r.owner_id === 't'), NOW, 'https://admin.neramclasses.com');
    expect(d.subject).toBe('2 follow-ups today (1 overdue, 1 Hot)');
    expect(d.plain.split('\n')[1]).toContain('Aamna Khan');
    expect(d.link).toBe('https://admin.neramclasses.com/follow-ups?range=today&mine=true');
    expect(d.plain).not.toMatch(/—|--/);
  });
  it('builds the manager summary per owner', () => {
    const s = buildManagerSummary(rows, { t: 3 }, { t: 'Tamil Selvan', s: 'Shanthi' }, NOW, 'https://admin.neramclasses.com');
    expect(s.plain).toContain('Tamil Selvan: 2 due (1 overdue), 3 done yesterday');
    expect(s.plain).toContain('Shanthi: 1 due (0 overdue), 0 done yesterday');
    expect(s.plain).toContain('Hot and overdue: Aamna Khan');
  });
});

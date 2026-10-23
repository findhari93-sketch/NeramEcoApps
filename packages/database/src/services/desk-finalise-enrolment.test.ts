// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Finalising a recorded payment from the demo desk. Pinned behaviour:
 *  - fold_parent merges the parent/lead INTO the existing student (relation
 *    'parent'), never provisions, and never calls the lead->student finalise path;
 *  - the money goes through the office fee writer once, keyed to the link;
 *  - a 'full' link that is only part paid is corrected to an installment plan;
 *  - create delegates to finaliseDirectEnrolment after normalising the link money.
 */
const createStudentProfile = vi.fn();
const getStudentProfileByUserId = vi.fn();
const updateStudentProfile = vi.fn();
const updateDirectEnrollmentLink = vi.fn();
const closeDemoFollowUpsOnEnrol = vi.fn();
const saveStudentApplicationAndFees = vi.fn();
const mergeUserRecordsLogged = vi.fn();
const finaliseDirectEnrolment = vi.fn();

vi.mock('../queries/users', () => ({
  createStudentProfile: (...a: unknown[]) => createStudentProfile(...a),
  getStudentProfileByUserId: (...a: unknown[]) => getStudentProfileByUserId(...a),
  updateStudentProfile: (...a: unknown[]) => updateStudentProfile(...a),
}));
vi.mock('../queries/direct-enrollment', () => ({ updateDirectEnrollmentLink: (...a: unknown[]) => updateDirectEnrollmentLink(...a) }));
vi.mock('../queries/demo-follow-ups', () => ({ closeDemoFollowUpsOnEnrol: (...a: unknown[]) => closeDemoFollowUpsOnEnrol(...a) }));
vi.mock('../queries/office-fees', () => ({ saveStudentApplicationAndFees: (...a: unknown[]) => saveStudentApplicationAndFees(...a) }));
vi.mock('../queries/user-merge', () => ({ mergeUserRecordsLogged: (...a: unknown[]) => mergeUserRecordsLogged(...a) }));
vi.mock('./direct-enrolment', () => ({ finaliseDirectEnrolment: (...a: unknown[]) => finaliseDirectEnrolment(...a) }));

import { finaliseEnrolmentFromDesk } from './desk-finalise-enrolment';

const USERS: Record<string, any> = {
  'student-1': { id: 'student-1', name: 'Aisha Eshal', email: 'aishaeshal@neramclasses.com', ms_oid: 'ms-aisha', firebase_uid: null, google_id: null, phone: null, date_of_birth: null },
  'parent-1': { id: 'parent-1', name: 'Sameera Najmal', email: 'sameera@gmail.com', ms_oid: null, firebase_uid: 'fb-sameera', google_id: null, phone: '+919656077577', date_of_birth: null },
  'parent-2': { id: 'parent-2', name: 'Other parent', email: 'other@gmail.com', ms_oid: 'ms-other', firebase_uid: 'fb-other', google_id: null, phone: null, date_of_birth: null },
};

const supabase = {
  from: (_table: string) => ({
    select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: USERS[id] ?? null, error: null }) }) }),
    upsert: async () => ({ error: null }),
  }),
} as any;

const link = (over: any = {}) => ({
  id: 'link-1',
  user_id: 'parent-1',
  demo_registration_id: 'demo-1',
  student_name: 'Eeshal',
  student_phone: '+919656077577',
  parent_phone: '+919656077577',
  status: 'active',
  payment_mode: 'recorded',
  final_fee: 30000,
  amount_paid: 15000,
  created_by: 'staff-9',
  ...over,
});

beforeEach(() => {
  for (const m of [createStudentProfile, getStudentProfileByUserId, updateStudentProfile, updateDirectEnrollmentLink, closeDemoFollowUpsOnEnrol, saveStudentApplicationAndFees, mergeUserRecordsLogged, finaliseDirectEnrolment]) m.mockReset();
  getStudentProfileByUserId.mockResolvedValue(null);
  createStudentProfile.mockResolvedValue({ id: 'sp-1', student_id: 'NRM-2026-0001' });
  updateStudentProfile.mockResolvedValue({ id: 'sp-1', student_id: 'NRM-2026-0001' });
  updateDirectEnrollmentLink.mockResolvedValue({});
  closeDemoFollowUpsOnEnrol.mockResolvedValue(undefined);
  saveStudentApplicationAndFees.mockResolvedValue({ payments: [], warnings: [] });
  mergeUserRecordsLogged.mockResolvedValue({ summary: [], logId: 'merge-log-1' });
  finaliseDirectEnrolment.mockResolvedValue({ ok: true, applicationNumber: 'NRM-DE-1', studentProfileId: 'sp-9', leadProfileId: 'lead-9', paymentKey: 'direct-link:link-1' });
});

describe('finaliseEnrolmentFromDesk: fold_parent', () => {
  const run = (over: any = {}) =>
    finaliseEnrolmentFromDesk(supabase, {
      link: link(),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 15000 },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
      ...over,
    });

  it('folds the parent into the student (relation parent) and never provisions', async () => {
    const res = await run();
    expect(res.ok).toBe(true);
    expect(finaliseDirectEnrolment).not.toHaveBeenCalled();
    expect(mergeUserRecordsLogged).toHaveBeenCalledTimes(1);
    const [winner, loser, actor, opts] = mergeUserRecordsLogged.mock.calls[0];
    expect(winner).toBe('student-1');
    expect(loser).toBe('parent-1');
    expect(actor).toBe('staff-9');
    expect(opts).toMatchObject({ relation: 'parent' });
  });

  it('creates the student fee profile with the real balance', async () => {
    await run();
    expect(createStudentProfile).toHaveBeenCalledTimes(1);
    const [profile] = createStudentProfile.mock.calls[0];
    expect(profile).toMatchObject({ user_id: 'student-1', total_fee: 30000, fee_paid: 15000, fee_due: 15000, payment_status: 'pending' });
    expect(profile.next_payment_date).toBeTruthy();
  });

  it('records the money once, keyed to the link, as an installment plan', async () => {
    await run();
    expect(saveStudentApplicationAndFees).toHaveBeenCalledTimes(1);
    const [opts] = saveStudentApplicationAndFees.mock.calls[0];
    expect(opts.userId).toBe('student-1');
    expect(opts.plan).toMatchObject({ scheme: 'installment', installment1Amount: 15000, installment2Amount: 15000 });
    expect(opts.payments).toHaveLength(1);
    expect(opts.payments[0]).toMatchObject({ key: 'direct-link:link-1', amount: 15000, installmentNumber: 1 });
  });

  it('marks the link used, pointing at the student profile', async () => {
    await run();
    expect(updateDirectEnrollmentLink).toHaveBeenCalledTimes(1);
    const [id, patch] = updateDirectEnrollmentLink.mock.calls[0];
    expect(id).toBe('link-1');
    expect(patch).toMatchObject({ status: 'used', used_by: 'student-1', student_profile_id: 'sp-1', verified_by: 'staff-9' });
    expect(patch.verified_at).toBeTruthy();
    expect(closeDemoFollowUpsOnEnrol).toHaveBeenCalledWith('student-1', supabase);
  });

  it('updates an existing student profile instead of creating a second one', async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: 'sp-existing', student_id: 'NRM-OLD' });
    await run();
    expect(createStudentProfile).not.toHaveBeenCalled();
    expect(updateStudentProfile).toHaveBeenCalledTimes(1);
    expect(updateStudentProfile.mock.calls[0][0]).toBe('sp-existing');
    expect(updateStudentProfile.mock.calls[0][1]).toMatchObject({ fee_paid: 15000, fee_due: 15000 });
  });

  it('a fully paid amount resolves to a full plan with nothing due', async () => {
    await run({ money: { totalFee: 30000, amountPaid: 30000 } });
    const [profile] = createStudentProfile.mock.calls[0];
    expect(profile).toMatchObject({ fee_due: 0, payment_status: 'paid', next_payment_date: null });
    const [opts] = saveStudentApplicationAndFees.mock.calls[0];
    expect(opts.plan.scheme).toBe('full');
  });

  it('refuses to fold two accounts that each have a different Microsoft login', async () => {
    const res = await finaliseEnrolmentFromDesk(supabase, {
      link: link({ user_id: 'parent-2' }),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 15000 },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
    expect(mergeUserRecordsLogged).not.toHaveBeenCalled();
  });
});

describe('finaliseEnrolmentFromDesk: payment date and method', () => {
  it('fold_parent records the payment on the given paidOn date, with the chosen method and reference', async () => {
    const res = await finaliseEnrolmentFromDesk(supabase, {
      link: link(),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 30000, paidOn: '2026-03-15', method: 'cash', reference: 'RCPT-42' },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
    });
    expect(res.ok).toBe(true);
    const [opts] = saveStudentApplicationAndFees.mock.calls[0];
    expect(opts.payments[0]).toMatchObject({ paidOn: '2026-03-15', method: 'cash', reference: 'RCPT-42' });
  });

  it('create passes the given paidOn to finaliseDirectEnrolment', async () => {
    await finaliseEnrolmentFromDesk(supabase, {
      link: link({ user_id: 'lead-1' }),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 30000, paidOn: '2026-02-01', method: 'bank_transfer' },
      target: { mode: 'create' },
    });
    const [, input] = finaliseDirectEnrolment.mock.calls[0];
    expect(input.payment).toMatchObject({ date: '2026-02-01', method: 'bank_transfer' });
  });

  it('a student who paid earlier is enrolled on the day they paid, not today', async () => {
    await finaliseEnrolmentFromDesk(supabase, {
      link: link(),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 30000, paidOn: '2026-03-15' },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
    });
    expect(createStudentProfile.mock.calls[0][0]).toMatchObject({ enrollment_date: '2026-03-15' });
    const [, patch] = updateDirectEnrollmentLink.mock.calls[0];
    expect(patch).toMatchObject({ used_at: '2026-03-15T12:00:00+05:30', payment_date: '2026-03-15' });
  });

  it('never enrols on a day in the future', async () => {
    await finaliseEnrolmentFromDesk(supabase, {
      link: link(),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 30000, paidOn: '2999-01-01' },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
    });
    expect(createStudentProfile.mock.calls[0][0].enrollment_date).not.toBe('2999-01-01');
  });

  it('defaults the payment date to today when none is given', async () => {
    await finaliseEnrolmentFromDesk(supabase, {
      link: link(),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 30000 },
      target: { mode: 'fold_parent', studentUserId: 'student-1' },
    });
    const [opts] = saveStudentApplicationAndFees.mock.calls[0];
    expect(opts.payments[0].paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('finaliseEnrolmentFromDesk: create', () => {
  it('normalises the link money then delegates to finaliseDirectEnrolment, no merge', async () => {
    const res = await finaliseEnrolmentFromDesk(supabase, {
      link: link({ user_id: 'lead-1' }),
      demoId: 'demo-1',
      actorId: 'staff-9',
      money: { totalFee: 30000, amountPaid: 15000 },
      target: { mode: 'create' },
    });
    expect(res.ok).toBe(true);
    expect(mergeUserRecordsLogged).not.toHaveBeenCalled();
    expect(finaliseDirectEnrolment).toHaveBeenCalledTimes(1);
    // The link money is normalised (installment) before finalise reads it.
    expect(updateDirectEnrollmentLink).toHaveBeenCalled();
    const [, patch] = updateDirectEnrollmentLink.mock.calls[0];
    expect(patch).toMatchObject({ payment_scheme: 'installment', amount_paid: 15000, final_fee: 30000 });
    const [, input] = finaliseDirectEnrolment.mock.calls[0];
    expect(input.userId).toBe('lead-1');
    expect(input.verifiedBy).toBe('staff-9');
  });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fakeDb } from '../services/payments/test-fake-db';
import { regenerateDirectEnrollmentLink } from './direct-enrollment';

/**
 * "Make a new link" must keep a student-pays link a student-pays link. The
 * column default is 'recorded', and a recorded link enrols the student the
 * moment they submit the form, with nothing paid. Pinned: the new link carries
 * the payment mode and the whole offer snapshot, and starts with no claim.
 */
const oldLink = {
  id: 'old-1',
  token: 'old-token',
  status: 'expired',
  created_by: 'staff-1',
  student_name: 'Radhika K',
  student_phone: '+917382843549',
  student_email: 'r@example.com',
  course_id: null,
  batch_id: null,
  center_id: null,
  interest_course: 'nata',
  learning_mode: 'hybrid',
  payment_mode: 'student_pays',
  fee_structure_id: 'fs-1',
  total_fee: 33000,
  discount_amount: 0,
  final_fee: 30000,
  amount_paid: 0,
  offer_full_amount: 30000,
  offer_installment_1: 16500,
  offer_installment_2: 16500,
  offer_balance_due_days: 60,
  chosen_scheme: 'installment',
  submitted_at: '2026-10-18T00:00:00.000Z',
  submitted_utr: '123456789012',
  payment_method: 'upi_direct',
  transaction_reference: null,
  payment_date: null,
  admin_notes: null,
  payment_proof_url: null,
  user_id: 'user-1',
  demo_registration_id: null,
  parent_phone: null,
  payment_scheme: 'full',
  installment_2_amount: null,
  installment_2_due_date: null,
};

describe('regenerateDirectEnrollmentLink', () => {
  it('keeps a student-pays link student-pays, with its offer, and no inherited claim', async () => {
    const db = fakeDb({ direct_enrollment_links: [oldLink] });
    const created = await regenerateDirectEnrollmentLink('old-1', 'new-token', 'staff-2', db.client as any);
    const row = db.rows('direct_enrollment_links').find((r) => r.token === 'new-token');
    expect(row).toBeTruthy();
    expect(created.token).toBe('new-token');
    expect(row).toMatchObject({
      payment_mode: 'student_pays',
      fee_structure_id: 'fs-1',
      total_fee: 33000,
      offer_full_amount: 30000,
      offer_installment_1: 16500,
      offer_installment_2: 16500,
      offer_balance_due_days: 60,
      amount_paid: 0,
      regenerated_from: 'old-1',
    });
    expect(row?.chosen_scheme ?? null).toBeNull();
    expect(row?.submitted_utr ?? null).toBeNull();
    expect(row?.submitted_at ?? null).toBeNull();
    expect(db.rows('direct_enrollment_links').find((r) => r.id === 'old-1')).toMatchObject({ status: 'cancelled', regenerated_to: row!.id });
  });

  it('a recorded link stays recorded', async () => {
    const db = fakeDb({ direct_enrollment_links: [{ ...oldLink, payment_mode: 'recorded', offer_full_amount: null, offer_installment_1: null, offer_installment_2: null, fee_structure_id: null, amount_paid: 25000, final_fee: 25000 }] });
    await regenerateDirectEnrollmentLink('old-1', 'new-token', 'staff-2', db.client as any);
    expect(db.rows('direct_enrollment_links').find((r) => r.token === 'new-token')).toMatchObject({ payment_mode: 'recorded', amount_paid: 25000 });
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Student-pays submissions are a claim, not money. These pin the three rules
 * that keep a family from being charged or enrolled wrongly:
 *  - the amount is the link's, whatever the browser sends;
 *  - a UTR already on a payment is refused;
 *  - nothing is enrolled until staff verify (finaliseDirectEnrolment is not called).
 */

type Row = Record<string, any>;
let link: Row;
let paymentWithUtr: Row | null = null;
let linkUpdateResult: { data: Row | null; error: any } = { data: { id: 'link-1' }, error: null };
const linkUpdates: Row[] = [];

function chain(table: string) {
  let pendingUpdate: Row | null = null;
  const api: any = {
    select: () => api,
    update: (payload: Row) => {
      pendingUpdate = payload;
      return api;
    },
    eq: () => api,
    is: () => api,
    limit: () => api,
    single: async () => ({ data: { id: 'user-1', user_type: 'lead', email: 'radhika@example.com', name: 'Radhika' }, error: null }),
    maybeSingle: async () => {
      if (table === 'payments') return { data: paymentWithUtr, error: null };
      if (table === 'direct_enrollment_links' && pendingUpdate) {
        linkUpdates.push(pendingUpdate);
        return linkUpdateResult;
      }
      return { data: null, error: null };
    },
  };
  return api;
}
const supabase = { from: (t: string) => chain(t) };

vi.mock('@neram/database', async () => {
  const fee = await vi.importActual<any>('@neram/database/fee-plan');
  return {
    createAdminClient: () => supabase,
    getDirectEnrollmentLinkByToken: async () => link,
    updateUser: vi.fn(),
    decideEnrolUser: vi.fn(),
    isDisposableAccount: vi.fn(),
    mergeUserRecords: vi.fn(),
    logDirectEnrollmentLinkEvent: vi.fn(async () => undefined),
    istToday: fee.istToday,
    isDateKey: fee.isDateKey,
    formatDueDate: fee.formatDueDate,
    addDaysToKey: fee.addDaysToKey,
  };
});

const finalise = vi.fn(async () => ({ ok: true, applicationNumber: 'N-1', studentProfileId: 'sp-1', leadProfileId: null, paymentKey: 'k' }));
vi.mock('@neram/database/fee-payment-claims', () => ({ isUtrTaken: async () => Boolean(paymentWithUtr) }));
vi.mock('@neram/database/direct-enrolment', () => ({ finaliseDirectEnrolment: (...a: unknown[]) => finalise(...(a as [])) }));

const submittedEmail = vi.fn(async () => ({ success: true }));
const staffAlert = vi.fn(async () => undefined);
const savedEmail = vi.fn(async () => ({ success: true }));
vi.mock('@neram/database/enrolment-payment-email', () => ({
  sendPaymentSubmittedEmail: (...a: unknown[]) => submittedEmail(...(a as [])),
  alertStaffPaymentToVerify: (...a: unknown[]) => staffAlert(...(a as [])),
  sendPaymentSavedEmail: (...a: unknown[]) => savedEmail(...(a as [])),
}));
let payeeWhatsapp: string | null = '+91 88074 37399';
vi.mock('@neram/database/payment-payee', () => ({
  getPaymentPayee: async () => ({ upiId: 'neramclassroom-1@okicici', payeeName: 'Manoharan Trust', gpayNumber: null, bank: { accountName: 'Manoharan Trust', accountNumber: '1928135000001183', ifsc: 'KVBL0001928', bankName: 'Karur Vysya Bank', branch: 'Pudukkottai' }, accessUntilLabel: 'September 2027', whatsappNumber: payeeWhatsapp }),
}));

// The signed-in account, and whether its phone is OTP-verified.
let accountPhoneVerified = true;
vi.mock('../../_lib/auth', () => ({
  verifyFirebaseToken: async () => ({ userId: 'user-1', email: 'radhika@example.com', phone: '+917382843549', phoneVerified: accountPhoneVerified }),
}));

import { POST } from './route';

const baseLink = {
  id: '4f2a9c1e-0000-0000-0000-000000000000',
  token: 'tok',
  status: 'active',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  user_id: 'user-1',
  student_name: 'Kunisetty Radhika',
  student_phone: '+917382843549',
  interest_course: 'both',
  payment_mode: 'student_pays',
  total_fee: 30000,
  discount_amount: 0,
  offer_full_amount: 25000,
  offer_installment_1: 16500,
  offer_installment_2: 13500,
  offer_balance_due_days: 45,
  demo_registration_id: 'demo-1',
};

const yesterday = new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().slice(0, 10);
const body = (over: Row = {}) => ({
  token: 'tok',
  firstName: 'Radhika',
  applicantCategory: 'school_student',
  phoneVerified: true,
  scheme: 'full',
  paymentMethod: 'upi_direct',
  transactionReference: '4123 4567 8901',
  paymentDate: yesterday,
  paymentProofUrl: 'https://x.supabase.co/storage/v1/object/public/payment-proofs/u/t/1.jpg',
  // A tampered browser: none of these may matter.
  amount: 1,
  amountPaid: 1,
  ...over,
});
const req = (b: Row) =>
  new NextRequest('http://localhost/api/enroll/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

beforeEach(() => {
  link = { ...baseLink };
  paymentWithUtr = null;
  linkUpdateResult = { data: { id: 'link-1' }, error: null };
  linkUpdates.length = 0;
  accountPhoneVerified = true;
  vi.clearAllMocks();
});

describe('POST /api/enroll/complete, phone verification', () => {
  it('refuses when the account phone is not OTP-verified, whatever the browser says', async () => {
    accountPhoneVerified = false;
    const res = await POST(req(body({ phoneVerified: true })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Phone verification/);
    expect(linkUpdates).toHaveLength(0);
  });
});

describe('POST /api/enroll/complete, student pays', () => {
  it('records the claim at the link amount, ignoring what the browser sent, and enrols nobody', async () => {
    const res = await POST(req(body()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('payment_submitted');
    expect(json.data.amount).toBe(25000);
    expect(linkUpdates[0]).toMatchObject({
      status: 'payment_submitted',
      chosen_scheme: 'full',
      submitted_amount: 25000,
      submitted_utr: '412345678901',
      submitted_method: 'upi_direct',
    });
    expect(finalise).not.toHaveBeenCalled();
    expect(submittedEmail).toHaveBeenCalledTimes(1);
    expect(staffAlert).toHaveBeenCalledTimes(1);
  });

  it('installments: 16,500 now and the 13,500 balance due 45 days after payment', async () => {
    const res = await POST(req(body({ scheme: 'installment' })));
    const json = await res.json();
    expect(json.data.amount).toBe(16500);
    expect(json.data.balance).toBe(13500);
    expect(linkUpdates[0]).toMatchObject({ payment_scheme: 'installment', installment_2_amount: 13500 });
    expect(linkUpdates[0].installment_2_due_date).toBeTruthy();
  });

  it('refuses installments the link does not offer', async () => {
    link = { ...baseLink, offer_installment_1: null, offer_installment_2: null };
    const res = await POST(req(body({ scheme: 'installment' })));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.scheme).toBeTruthy();
  });

  it('refuses a UTR already on a recorded payment', async () => {
    paymentWithUtr = { id: 'pay-9' };
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('UTR_USED');
    expect(linkUpdates).toHaveLength(0);
  });

  it('refuses a UTR another link already submitted (unique index)', async () => {
    linkUpdateResult = { data: null, error: { code: '23505', message: 'duplicate' } };
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('UTR_USED');
  });

  it('needs a 12-digit UPI reference, a past date and a screenshot', async () => {
    const res = await POST(req(body({ transactionReference: '12345', paymentDate: '2999-01-01', paymentProofUrl: null })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Object.keys(json.fieldErrors).sort()).toEqual(['paymentDate', 'paymentProofUrl', 'transactionReference']);
  });

  it('the UTR is optional: new students rarely know it', async () => {
    const res = await POST(req(body({ transactionReference: '' })));
    expect(res.status).toBe(200);
    expect(linkUpdates[0]).toMatchObject({ status: 'payment_submitted', submitted_utr: null, submitted_proof_channel: 'upload' });
  });

  it('"I sent it on WhatsApp" needs no screenshot once the student confirms', async () => {
    const res = await POST(req(body({ transactionReference: '', paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: true })));
    expect(res.status).toBe(200);
    expect(linkUpdates[0]).toMatchObject({ status: 'payment_submitted', submitted_proof_channel: 'whatsapp', submitted_proof_url: null, submitted_utr: null });
    expect(staffAlert).toHaveBeenCalledTimes(1);
  });

  it('WhatsApp is refused when Settings has no WhatsApp number', async () => {
    payeeWhatsapp = null;
    try {
      const res = await POST(req(body({ paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: true })));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(Object.keys(json.fieldErrors)).toEqual(['proofChannel']);
    } finally {
      payeeWhatsapp = '+91 88074 37399';
    }
  });

  it('WhatsApp without the confirmation is refused', async () => {
    const res = await POST(req(body({ paymentProofUrl: null, proofChannel: 'whatsapp', whatsappSent: false })));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(Object.keys(json.fieldErrors)).toEqual(['whatsappSent']);
  });

  it('remembers whose account the money came from', async () => {
    await POST(req(body({ payerName: '  Appa  ' })));
    expect(linkUpdates[0]).toMatchObject({ submitted_payer_name: 'Appa' });
  });

  it('pay later: saves the details, keeps the link open, emails the payment details, enrols nobody', async () => {
    const res = await POST(req(body({ intent: 'pay_later', transactionReference: '', paymentProofUrl: null })));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('details_saved');
    expect(linkUpdates[0]).toMatchObject({ details_saved_at: expect.any(String), submitted_user_id: 'user-1', chosen_scheme: 'full' });
    expect(linkUpdates[0].status).toBeUndefined();
    expect(finalise).not.toHaveBeenCalled();
    expect(submittedEmail).not.toHaveBeenCalled();
    expect(savedEmail).toHaveBeenCalledTimes(1);
  });

  it('a link already submitted cannot be submitted again', async () => {
    link = { ...baseLink, status: 'payment_submitted' };
    const res = await POST(req(body()));
    expect(res.status).toBe(400);
    expect(linkUpdates).toHaveLength(0);
  });
});

describe('POST /api/enroll/complete, recorded links still enrol at once', () => {
  it('calls the shared finaliser', async () => {
    link = { ...baseLink, payment_mode: 'recorded', amount_paid: 25000, final_fee: 25000 };
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect((await res.json()).data.applicationNumber).toBe('N-1');
    expect(finalise).toHaveBeenCalledTimes(1);
  });
});

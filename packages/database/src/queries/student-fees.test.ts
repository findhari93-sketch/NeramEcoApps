import { describe, it, expect } from 'vitest';
import {
  validateFees,
  setStudentFees,
  STUDENT_FEE_FIELDS,
  BACKFILL_RECEIPT_PREFIX,
  StudentFeeError,
} from './student-fees';

/**
 * These guard money. A wrong number here is not a cosmetic bug: it becomes the
 * balance a real student is chased for, so the arithmetic checks refuse rather
 * than guess, and the write path is pinned against double-counting a payment.
 */

describe('validateFees', () => {
  it('accepts a plain consistent fee', () => {
    const { errors } = validateFees({ assigned_fee: 45000, discount_amount: 5000, final_fee: 40000 });
    expect(errors).toEqual([]);
  });

  it('refuses a final fee that contradicts assigned minus discount', () => {
    // One of the three is a typo and we cannot know which, so we must not pick.
    const { errors } = validateFees({ assigned_fee: 45000, discount_amount: 5000, final_fee: 45000 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('final_fee');
  });

  it('treats a missing discount as zero rather than as unknown', () => {
    const { errors } = validateFees({ assigned_fee: 40000, final_fee: 40000 });
    expect(errors).toEqual([]);
  });

  it('refuses negative money', () => {
    const { errors } = validateFees({ final_fee: -1 });
    expect(errors[0]).toContain('cannot be negative');
  });

  it('refuses instalments for a student allowed to pay in full only', () => {
    const { errors } = validateFees({ allowed_payment_modes: 'full_only', payment_scheme: 'installment' });
    expect(errors.some((e) => e.includes('only allowed to pay in full'))).toBe(true);
  });

  it('refuses an enum value that is not in the database CHECK', () => {
    const { errors } = validateFees({ allowed_payment_modes: 'anything' as any });
    expect(errors.some((e) => e.includes('allowed_payment_modes'))).toBe(true);
  });

  it('refuses a deadline that is not YYYY-MM-DD', () => {
    expect(validateFees({ payment_deadline: '15/10/2026' }).errors).toHaveLength(1);
    expect(validateFees({ payment_deadline: '2026-10-15' }).errors).toEqual([]);
  });

  it('warns, but does not refuse, when instalments do not sum to the final fee', () => {
    // Part payments and rounding are real; staff must see it, not be blocked.
    const { errors, warnings } = validateFees({
      final_fee: 40000, installment_1_amount: 20000, installment_2_amount: 15000,
    });
    expect(errors).toEqual([]);
    expect(warnings[0]).toContain('add up to 35000');
  });

  it('warns, but does not refuse, an overpayment', () => {
    const { errors, warnings } = validateFees({ final_fee: 40000 }, { amount: 45000 });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('more than the final fee'))).toBe(true);
  });

  it('reads rupee strings out of a pasted spreadsheet', () => {
    const { errors } = validateFees({
      assigned_fee: '45,000' as any, discount_amount: '5,000' as any, final_fee: '40,000' as any,
    });
    expect(errors).toEqual([]);
  });

  it('covers all eleven fields', () => {
    expect(STUDENT_FEE_FIELDS).toHaveLength(11);
  });
});

// ─── setStudentFees against a fake supabase ─────────────────────────────────

interface FakeState {
  user?: any;
  lead?: any;
  studentProfile?: any;
  payments?: any[];
}

function fakeSupabase(state: FakeState) {
  const writes: { table: string; op: string; payload: any }[] = [];
  const payments = state.payments ?? [];

  const builder = (table: string) => {
    const ctx: any = { table, filters: {} as Record<string, unknown>, like: null as string | null };
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
      is: () => api,
      like: (_col: string, pattern: string) => { ctx.like = pattern; return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: read(), error: null }),
      single: async () => ({ data: read(), error: null }),
      then: (resolve: any) => resolve({ data: readMany(), error: null }),
      insert: (payload: any) => {
        writes.push({ table, op: 'insert', payload });
        const row = { id: `new-${table}`, ...payload };
        if (table === 'payments') payments.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      update: (payload: any) => {
        writes.push({ table, op: 'update', payload });
        return { eq: async () => ({ error: null }) };
      },
    };

    function read() {
      if (table === 'users') return state.user ?? null;
      if (table === 'lead_profiles') return state.lead ?? null;
      if (table === 'student_profiles') return state.studentProfile ?? null;
      return null;
    }
    function readMany() {
      if (table === 'payments') {
        if (ctx.like) return payments.filter((p) => String(p.receipt_number || '').startsWith(ctx.like.replace('%', '')));
        if (ctx.filters.status === 'paid') return payments.filter((p) => p.status === 'paid');
        return payments;
      }
      return [];
    }
    return api;
  };

  return { client: { from: builder }, writes, payments };
}

const USER = { id: 'u1', name: 'Ananya AnoopPuthan', user_type: 'student', is_alumni: false };

describe('setStudentFees', () => {
  it('dry run reports the changes and writes nothing', async () => {
    const fake = fakeSupabase({ user: USER, lead: null });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, dryRun: true },
      fake.client,
    );
    expect(res.applied).toBe(false);
    expect(res.changes.final_fee).toEqual({ before: null, after: 40000 });
    expect(fake.writes).toEqual([]);
  });

  it('warns in a dry run that an application record would be created', async () => {
    // Staff must learn this before they press apply, not after.
    const fake = fakeSupabase({ user: USER, lead: null });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, dryRun: true }, fake.client,
    );
    expect(res.createdLead).toBe(true);
    expect(res.applied).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it('does not claim it would create one when a lead already exists', async () => {
    const fake = fakeSupabase({ user: USER, lead: { id: 'l1' } });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, dryRun: true }, fake.client,
    );
    expect(res.createdLead).toBe(false);
  });

  it('creates the application row for a student who never had one', async () => {
    const fake = fakeSupabase({ user: USER, lead: null, studentProfile: null });
    const res = await setStudentFees(
      { userId: 'u1', fees: { assigned_fee: 45000, discount_amount: 5000, final_fee: 40000 }, adminId: 'a1' },
      fake.client,
    );
    expect(res.createdLead).toBe(true);
    const insert = fake.writes.find((w) => w.table === 'lead_profiles' && w.op === 'insert');
    expect(insert!.payload.source).toBe('manual');
    expect(insert!.payload.status).toBe('enrolled');
    expect(insert!.payload.final_fee).toBe(40000);
  });

  it('records collected money as a paid payment with its own receipt prefix', async () => {
    const fake = fakeSupabase({ user: USER, lead: { id: 'l1' }, studentProfile: { id: 'sp1' } });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, collected: { amount: 20000 }, adminId: 'a1' },
      fake.client,
    );
    expect(res.payment!.created).toBe(true);
    const insert = fake.writes.find((w) => w.table === 'payments')!;
    expect(insert.payload.status).toBe('paid');
    expect(insert.payload.receipt_number.startsWith(BACKFILL_RECEIPT_PREFIX)).toBe(true);
    // payments has no `notes` column; using one silently voided 57 of 59 rows once.
    expect(insert.payload).not.toHaveProperty('notes');
    expect(insert.payload).toHaveProperty('description');
  });

  it('does not record the same collected money twice when re-run', async () => {
    const fake = fakeSupabase({
      user: USER, lead: { id: 'l1' }, studentProfile: { id: 'sp1' },
      payments: [{ id: 'p0', amount: 20000, status: 'paid', receipt_number: `${BACKFILL_RECEIPT_PREFIX}ABC` }],
    });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, collected: { amount: 20000 }, adminId: 'a1' },
      fake.client,
    );
    expect(res.payment!.created).toBe(false);
    expect(res.payment!.reason).toContain('already exists');
    expect(fake.writes.filter((w) => w.table === 'payments')).toHaveLength(0);
  });

  it('leaves a stored value alone when the field is absent from the input', async () => {
    // A spreadsheet with a blank column must not wipe a fee set elsewhere.
    const fake = fakeSupabase({
      user: USER,
      lead: { id: 'l1', final_fee: 40000, coupon_code: 'NERAM500' },
      studentProfile: { id: 'sp1' },
    });
    const res = await setStudentFees(
      { userId: 'u1', fees: { payment_scheme: 'full' }, adminId: 'a1' },
      fake.client,
    );
    expect(res.changes).not.toHaveProperty('coupon_code');
    const update = fake.writes.find((w) => w.table === 'lead_profiles' && w.op === 'update')!;
    expect(update.payload).not.toHaveProperty('coupon_code');
  });

  it('clears a value when the field is explicitly null', async () => {
    const fake = fakeSupabase({
      user: USER, lead: { id: 'l1', coupon_code: 'NERAM500' }, studentProfile: { id: 'sp1' },
    });
    const res = await setStudentFees(
      { userId: 'u1', fees: { coupon_code: null }, adminId: 'a1' },
      fake.client,
    );
    expect(res.changes.coupon_code).toEqual({ before: 'NERAM500', after: null });
  });

  it('refuses inconsistent arithmetic before touching the database', async () => {
    const fake = fakeSupabase({ user: USER, lead: null });
    await expect(
      setStudentFees(
        { userId: 'u1', fees: { assigned_fee: 45000, discount_amount: 5000, final_fee: 45000 } },
        fake.client,
      ),
    ).rejects.toBeInstanceOf(StudentFeeError);
    expect(fake.writes).toEqual([]);
  });

  it('says so when there is no student_profiles row to cache into', async () => {
    const fake = fakeSupabase({ user: USER, lead: { id: 'l1' }, studentProfile: null });
    const res = await setStudentFees(
      { userId: 'u1', fees: { final_fee: 40000 }, adminId: 'a1' },
      fake.client,
    );
    expect(res.warnings.some((w) => w.includes('fee cache was not refreshed'))).toBe(true);
  });

  it('flags an alumnus rather than refusing, since old debts are still real', async () => {
    const fake = fakeSupabase({
      user: { ...USER, is_alumni: true }, lead: { id: 'l1' }, studentProfile: { id: 'sp1' },
    });
    const res = await setStudentFees({ userId: 'u1', fees: { final_fee: 40000 } }, fake.client);
    expect(res.warnings.some((w) => w.includes('graduated'))).toBe(true);
    expect(res.applied).toBe(true);
  });
});

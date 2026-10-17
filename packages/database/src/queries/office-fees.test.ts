import { describe, it, expect } from 'vitest';
import {
  saveStudentApplicationAndFees,
  recordOfficePayment,
  loadStudentFeeState,
  OFFICE_RECEIPT_PREFIX,
} from './office-fees';
import { StudentFeeError } from './student-fees';

/**
 * The office form writes money for real students. These pin the parts that would
 * hurt if they broke: a double click recording money twice, the second
 * installment losing its date, a part-paid student crashing the save, and a
 * profile-page row staying "No application form" after staff filled it in.
 */

// ─── a small in-memory Supabase ──────────────────────────────────────────────

type Row = Record<string, any>;

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let seq = 0;
  const writes: { table: string; op: string; payload: any }[] = [];

  function from(table: string) {
    tables[table] = tables[table] || [];
    const filters: ((r: Row) => boolean)[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let mode: 'select' | 'update' | 'delete' = 'select';
    let patch: Row | null = null;

    const rows = () => {
      let out = tables[table].filter((r) => filters.every((f) => f(r)));
      if (orderBy) {
        const { col, asc } = orderBy;
        out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (limit !== null) out = out.slice(0, limit);
      return out;
    };
    const run = () => {
      if (mode === 'update') {
        const hit = rows();
        for (const r of hit) Object.assign(r, patch);
        writes.push({ table, op: 'update', payload: patch });
        return { data: hit, error: null };
      }
      if (mode === 'delete') {
        const hit = new Set(rows());
        tables[table] = tables[table].filter((r) => !hit.has(r));
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return api; },
      neq: (c: string, v: any) => { filters.push((r) => r[c] !== v); return api; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      lt: (c: string, v: any) => { filters.push((r) => r[c] < v); return api; },
      like: (c: string, p: string) => { filters.push((r) => String(r[c] ?? '').startsWith(p.replace('%', ''))); return api; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return api; },
      limit: (n: number) => { limit = n; return api; },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
      update: (p: Row) => { mode = 'update'; patch = p; return api; },
      delete: () => { mode = 'delete'; return api; },
      insert: (payload: Row) => {
        const row = { id: `${table}-${++seq}`, created_at: new Date(Date.UTC(2026, 9, 16, 0, 0, seq)).toISOString(), ...payload };
        if (table === 'payments' && row.idempotency_key && tables.payments.some((p) => p.idempotency_key === row.idempotency_key)) {
          const err = { code: '23505', message: 'duplicate key value violates unique constraint "payments_idempotency_key_uidx"' };
          return { select: () => ({ single: async () => ({ data: null, error: err }) }) };
        }
        tables[table].push(row);
        writes.push({ table, op: 'insert', payload });
        const res = { data: row, error: null };
        return { select: () => ({ single: async () => res }), then: (r: any) => r(res) };
      },
      upsert: (payload: Row, opts: { onConflict: string }) => {
        const keys = opts.onConflict.split(',');
        const prior = tables[table].find((r) => keys.every((k) => r[k] === payload[k]));
        if (prior) Object.assign(prior, payload);
        else tables[table].push({ id: `${table}-${++seq}`, ...payload });
        writes.push({ table, op: 'upsert', payload });
        const res = { data: null, error: null };
        return { select: async () => res, then: (r: any) => r(res) };
      },
    };
    return api;
  }

  return { client: { from }, tables, writes };
}

const USER = { id: 'u1', name: 'Rayna Choudhary', user_type: 'student', is_alumni: false };
const PROFILE_ROW = {
  id: 'lp-profile', user_id: 'u1', source: 'manual', applicant_category: 'school_student',
  application_number: null, reviewed_by: null, deleted_at: null, created_at: '2026-10-06T00:00:00Z',
};

function seed(extra: Record<string, Row[]> = {}) {
  return fakeDb({
    users: [USER],
    lead_profiles: [PROFILE_ROW],
    student_profiles: [{ id: 'sp1', user_id: 'u1' }],
    payments: [],
    payment_installments: [],
    student_record_checks: [],
    fee_correction_reports: [],
    user_history: [],
    ...extra,
  });
}

const TWO_INSTALLMENTS = {
  assignedFee: 35000,
  discount: 5000,
  scheme: 'installment' as const,
  installment1Amount: 15000,
  installment2Amount: 15000,
  installment2DueDate: '2026-12-01',
};
const FIRST_PAYMENT = { key: 'k-1', amount: 15000, paidOn: '2026-10-06', method: 'upi_direct', reference: 'UTR123' };

describe('saveStudentApplicationAndFees', () => {
  it('writes the plan, the payment, both installments and a dated cache', async () => {
    const db = seed();
    const res = await saveStudentApplicationAndFees(
      { userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'admin-1', details: { father_name: 'R. Choudhary' } },
      db.client,
    );
    expect(res.applied).toBe(true);
    const lead = db.tables.lead_profiles[0];
    expect(lead).toMatchObject({ final_fee: 30000, payment_scheme: 'installment', installment_2_amount: 15000, father_name: 'R. Choudhary', fee_source: 'admin' });

    const pay = db.tables.payments[0];
    expect(pay.receipt_number.startsWith(OFFICE_RECEIPT_PREFIX)).toBe(true);
    expect(pay).toMatchObject({ status: 'paid', idempotency_key: 'k-1', paid_at: '2026-10-06T00:00:00+05:30', payment_method: 'upi_direct' });
    expect(pay).not.toHaveProperty('notes');

    const inst = [...db.tables.payment_installments].sort((a, b) => a.installment_number - b.installment_number);
    expect(inst.map((i) => [i.installment_number, i.due_date, i.status])).toEqual([
      [1, '2026-10-06', 'paid'],
      [2, '2026-12-01', 'pending'],
    ]);
    expect(inst[1].reminder_date).toBe('2026-11-28');

    expect(db.tables.student_profiles[0]).toMatchObject({
      total_fee: 30000, fee_paid: 15000, fee_due: 15000, payment_status: 'pending', next_payment_date: '2026-12-01',
    });
    expect(res.view.nextDue).toMatchObject({ number: 2, amount: 15000, dueDate: '2026-12-01' });
  });

  it('turns the profile-page row into a staff-entered application', async () => {
    // Rayna's case: without reviewed_by, Nexus would still say "No application form".
    const db = seed();
    const res = await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'admin-1' }, db.client);
    expect(res.stampedReviewer).toBe(true);
    expect(db.tables.lead_profiles[0].reviewed_by).toBe('admin-1');
  });

  it('creates the application row when there is none, stamped as staff-entered', async () => {
    const db = seed({ lead_profiles: [] });
    const res = await saveStudentApplicationAndFees({ userId: 'u1', plan: { assignedFee: 30000, scheme: 'full' }, adminId: 'admin-1' }, db.client);
    expect(res.createdLead).toBe(true);
    expect(db.tables.lead_profiles[0]).toMatchObject({ source: 'manual', status: 'enrolled', reviewed_by: 'admin-1', final_fee: 30000 });
  });

  it('records the same payment line once, however many times it is saved', async () => {
    const db = seed();
    await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    const again = await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    expect(db.tables.payments).toHaveLength(1);
    expect(again.payments[0].created).toBe(false);
  });

  it('records a second payment with its own key, and settles installment 2', async () => {
    const db = seed();
    await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    const res = await saveStudentApplicationAndFees(
      { userId: 'u1', plan: TWO_INSTALLMENTS, payments: [{ key: 'k-2', amount: 15000, paidOn: '2026-10-15', method: 'cash' }], adminId: 'a' },
      db.client,
    );
    expect(db.tables.payments).toHaveLength(2);
    expect(db.tables.payment_installments.every((i) => i.status === 'paid')).toBe(true);
    expect(db.tables.student_profiles[0]).toMatchObject({ payment_status: 'paid', fee_due: 0, next_payment_date: null });
    expect(res.view.nextDue).toBeNull();
  });

  it('waives an unpaid second installment when the plan becomes full payment', async () => {
    const db = seed();
    await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    await saveStudentApplicationAndFees({ userId: 'u1', plan: { assignedFee: 35000, discount: 20000, scheme: 'full' }, adminId: 'a' }, db.client);
    const second = db.tables.payment_installments.find((i) => i.installment_number === 2)!;
    expect(second.status).toBe('waived');
    expect(db.tables.lead_profiles[0]).toMatchObject({ payment_scheme: 'full', installment_2_amount: null, final_fee: 15000 });
  });

  it('re-arms the reminder when the due date moves', async () => {
    const db = seed();
    await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    const second = db.tables.payment_installments.find((i) => i.installment_number === 2)!;
    second.reminder_sent = true;
    await saveStudentApplicationAndFees({ userId: 'u1', plan: { ...TWO_INSTALLMENTS, installment2DueDate: '2026-12-15' }, adminId: 'a' }, db.client);
    expect(second).toMatchObject({ due_date: '2026-12-15', reminder_sent: false });
  });

  it('marks a confirmed check as changed when the figures move', async () => {
    const db = seed({
      student_record_checks: [{ id: 'c1', user_id: 'u1', status: 'confirmed', fee_signature: 'old', created_at: '2026-10-10T00:00:00Z' }],
    });
    const res = await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    expect(res.checkChanged).toBe(true);
    expect(db.tables.student_record_checks[0].status).toBe('changed');
  });

  it('accepts the student report it resolves, with the payments it made', async () => {
    const db = seed({
      fee_correction_reports: [{ id: 'r1', user_id: 'u1', status: 'open', check_id: null }],
    });
    await saveStudentApplicationAndFees(
      { userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a', resolvesCorrectionId: 'r1' },
      db.client,
    );
    expect(db.tables.fee_correction_reports[0]).toMatchObject({ status: 'accepted', resolved_by: 'a' });
    expect(db.tables.fee_correction_reports[0].resulting_payment_ids).toEqual([db.tables.payments[0].id]);
  });

  it('refuses a plan that does not add up, with field errors and no writes', async () => {
    const db = seed();
    const err = await saveStudentApplicationAndFees(
      { userId: 'u1', plan: { ...TWO_INSTALLMENTS, installment2Amount: 10000 }, adminId: 'a' },
      db.client,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(StudentFeeError);
    expect(err.fieldErrors.some((e: any) => e.field === 'installment2Amount')).toBe(true);
    expect(db.writes).toEqual([]);
  });

  it('dry run reports and writes nothing', async () => {
    const db = seed();
    const res = await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a', dryRun: true }, db.client);
    expect(res.applied).toBe(false);
    expect(res.changes.final_fee).toEqual({ before: null, after: 30000 });
    expect(db.writes).toEqual([]);
  });
});

describe('recordOfficePayment', () => {
  it('needs a fee to record against', async () => {
    const db = seed();
    await expect(
      recordOfficePayment({ userId: 'u1', line: FIRST_PAYMENT, adminId: 'a' }, db.client),
    ).rejects.toBeInstanceOf(StudentFeeError);
  });

  it('records a payment and closes the installment it covers', async () => {
    const db = seed();
    await saveStudentApplicationAndFees({ userId: 'u1', plan: TWO_INSTALLMENTS, payments: [FIRST_PAYMENT], adminId: 'a' }, db.client);
    const res = await recordOfficePayment(
      { userId: 'u1', line: { key: 'k-9', amount: 15000, paidOn: '2026-10-16', method: 'bank_transfer' }, adminId: 'a' },
      db.client,
    );
    expect(res.payment.created).toBe(true);
    expect(res.view.balance).toBe(0);
    const state = await loadStudentFeeState(db.client, 'u1');
    expect(state.installments.every((i) => i.status === 'paid')).toBe(true);
  });
});

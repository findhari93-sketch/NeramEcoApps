// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatRupees, istMonthStart, loadDashboardSummary, REVIEW_STATUSES } from './dashboard-stats';

/**
 * Minimal fake of the Supabase builder: records every filter per table and
 * answers from a fixed response for that table.
 */
function fakeDb(responses: Record<string, unknown>) {
  const log: Record<string, Array<[string, unknown[]]>> = {};
  const from = (table: string) => {
    // One call list per query (two queries can hit one table), mirrored into the
    // per-table log the assertions read.
    const calls: Array<[string, unknown[]]> = [];
    const tableLog = (log[table] = log[table] || []);
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = responses[table];
            return (resolve: (v: unknown) => void) => resolve(typeof r === 'function' ? (r as any)(calls) : r);
          }
          return (...args: unknown[]) => {
            calls.push([prop, args]);
            tableLog.push([prop, args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { db: { from }, log };
}

describe('istMonthStart', () => {
  it('uses the India calendar month, not UTC', () => {
    // 30 Sep 20:00 UTC is already 1 Oct 01:30 in India.
    expect(istMonthStart(new Date('2026-09-30T20:00:00Z')).toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(istMonthStart(new Date('2026-09-25T10:00:00Z')).toISOString()).toBe('2026-08-31T18:30:00.000Z');
  });
});

describe('formatRupees', () => {
  it('uses Indian grouping and lakh / crore', () => {
    expect(formatRupees(55000)).toBe('₹55,000');
    expect(formatRupees(450000)).toBe('₹4.5L');
    expect(formatRupees(12500000)).toBe('₹1.3Cr');
    expect(formatRupees(0)).toBe('₹0');
  });
});

describe('loadDashboardSummary', () => {
  const now = new Date('2026-09-25T10:00:00Z');

  it('counts distinct enrolled students in live rooms and sums paid this month', async () => {
    const { db, log } = fakeDb({
      nexus_classrooms: { data: [{ id: 'r1' }, { id: 'r2' }] },
      nexus_enrollments: { data: [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }] },
      users: { count: 12 },
      lead_profiles: { count: 125 },
      payments: (calls: Array<[string, unknown[]]>) =>
        calls.some(([m, a]) => m === 'eq' && a[1] === 'paid')
          ? { data: [{ amount: '30000.00' }, { amount: 25000 }, { amount: null }] }
          : { count: 20 },
    });

    const s = await loadDashboardSummary(db, now);
    expect(s).toEqual({
      activeStudents: 2,
      newLeads7d: 12,
      applicationsToReview: 125,
      collectedThisMonth: 55000,
      paymentsPending: 20,
      generatedAt: now.toISOString(),
    });

    // The student rule: role student, active, only in the live rooms.
    const enrol = log.nexus_enrollments;
    expect(enrol).toContainEqual(['eq', ['role', 'student']]);
    expect(enrol).toContainEqual(['eq', ['is_active', true]]);
    expect(enrol).toContainEqual(['in', ['classroom_id', ['r1', 'r2']]]);
    expect(log.nexus_classrooms).toContainEqual(['not', ['is_archived', 'is', true]]);

    // Applications: the review statuses, never the non-existent 'new'.
    expect(log.lead_profiles).toContainEqual(['in', ['status', [...REVIEW_STATUSES]]]);
    expect(log.lead_profiles).toContainEqual(['is', ['deleted_at', null]]);

    // Leads are lead accounts from the last 7 days.
    expect(log.users).toContainEqual(['eq', ['user_type', 'lead']]);
    expect(log.users).toContainEqual(['gte', ['created_at', '2026-09-18T10:00:00.000Z']]);
  });

  it('skips the enrolment query when no classroom is live', async () => {
    const { db, log } = fakeDb({
      nexus_classrooms: { data: [] },
      users: { count: 0 },
      lead_profiles: { count: 0 },
      payments: { data: [], count: 0 },
    });
    const s = await loadDashboardSummary(db, now);
    expect(s.activeStudents).toBe(0);
    expect(log.nexus_enrollments).toBeUndefined();
  });

  it('throws on a query error instead of showing a false zero', async () => {
    const { db } = fakeDb({
      nexus_classrooms: { data: [] },
      users: { error: { message: 'permission denied' } },
      lead_profiles: { count: 0 },
      payments: { data: [], count: 0 },
    });
    await expect(loadDashboardSummary(db, now)).rejects.toThrow('new leads: permission denied');
  });
});

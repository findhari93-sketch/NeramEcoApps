/**
 * The four numbers on the admin dashboard, each with one written-down meaning.
 *
 * The old /api/stats counted "students" as user_type student + status active
 * (161 on prod, alumni included) and "pending leads" as lead_profiles.status
 * 'new', a value that enum does not have (always 0). These definitions match the
 * rest of the system instead:
 *
 *  - activeStudents: distinct users with an active student enrolment in a live
 *    (not archived) classroom. The same rule Nexus uses to let a student in.
 *  - newLeads7d: lead accounts created in the last 7 days.
 *  - applicationsToReview: live application forms waiting on staff.
 *  - collectedThisMonth / paymentsPending: paid since the 1st of this month in
 *    India time, and payments still pending.
 */

// Structural type: enough of the Supabase query builder for these reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export interface DashboardSummary {
  activeStudents: number;
  newLeads7d: number;
  applicationsToReview: number;
  collectedThisMonth: number;
  paymentsPending: number;
  generatedAt: string;
}

export const REVIEW_STATUSES = ['submitted', 'under_review', 'pending_verification'] as const;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Midnight on the 1st of the current month in India, as a UTC instant. */
export function istMonthStart(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

function check<T>(result: { data?: T; count?: number | null; error?: { message: string } | null }, what: string) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result;
}

export async function loadDashboardSummary(db: Db, now: Date = new Date()): Promise<DashboardSummary> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = istMonthStart(now).toISOString();

  const [liveRooms, newLeads, toReview, paid, pending] = await Promise.all([
    db.from('nexus_classrooms').select('id').not('is_archived', 'is', true),
    db.from('users').select('id', { count: 'exact', head: true }).eq('user_type', 'lead').gte('created_at', weekAgo),
    db
      .from('lead_profiles')
      .select('id', { count: 'exact', head: true })
      .in('status', [...REVIEW_STATUSES])
      .is('deleted_at', null),
    db.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart),
    db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const roomIds = ((check(liveRooms, 'classrooms').data as { id: string }[]) || []).map((r) => r.id);

  let activeStudents = 0;
  if (roomIds.length) {
    const enrolled = check(
      await db
        .from('nexus_enrollments')
        .select('user_id')
        .eq('role', 'student')
        .eq('is_active', true)
        .in('classroom_id', roomIds),
      'enrollments',
    );
    activeStudents = new Set(((enrolled.data as { user_id: string }[]) || []).map((e) => e.user_id)).size;
  }

  const paidRows = (check(paid, 'payments').data as { amount: number | string | null }[]) || [];

  return {
    activeStudents,
    newLeads7d: check(newLeads, 'new leads').count ?? 0,
    applicationsToReview: check(toReview, 'applications').count ?? 0,
    collectedThisMonth: paidRows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    paymentsPending: check(pending, 'pending payments').count ?? 0,
    generatedAt: now.toISOString(),
  };
}

/** ₹ in Indian notation, compact above one lakh: 55000 → ₹55,000, 450000 → ₹4.5L. */
export function formatRupees(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${trim(amount / 1_00_00_000)}Cr`;
  if (amount >= 1_00_000) return `₹${trim(amount / 1_00_000)}L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

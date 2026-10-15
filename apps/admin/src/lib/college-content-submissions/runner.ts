/**
 * Decides a college content submission: approve applies the payload (see
 * apply.ts for exactly what is written), reject records the note. Only a
 * pending submission can be decided. Server only.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { buildApplyPlan, isSection } from './apply';

export class DecisionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'DecisionError';
  }
}

export interface DecisionResult {
  id: string;
  status: 'approved' | 'rejected';
  college: { id: string; name: string; slug: string | null; state_slug: string | null } | null;
}

const from = (table: string) => getSupabaseAdminClient().from(table as never) as any;

interface SubmissionRow {
  id: string;
  college_id: string;
  section: string;
  payload: unknown;
  status: string;
  colleges: { id: string; name: string; slug: string | null; state_slug: string | null; college_provided: unknown } | null;
}

export async function decideSubmission(
  id: string,
  decision: 'approve' | 'reject',
  note: string | null,
  staff: string,
): Promise<DecisionResult> {
  const { data, error } = await from('college_content_submissions')
    .select('id, college_id, section, payload, status, colleges(id, name, slug, state_slug, college_provided)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new DecisionError(error.message, 500);
  if (!data) throw new DecisionError('Submission not found.', 404);
  const sub = data as SubmissionRow;
  if (sub.status !== 'pending') throw new DecisionError(`This submission was already ${sub.status}.`, 409);

  const nowIso = new Date().toISOString();
  const college = sub.colleges
    ? { id: sub.colleges.id, name: sub.colleges.name, slug: sub.colleges.slug, state_slug: sub.colleges.state_slug }
    : null;

  if (decision === 'reject') {
    if (!note?.trim()) throw new DecisionError('Add a short note so the college knows what to fix.', 400);
  } else {
    if (!isSection(sub.section)) throw new DecisionError(`Unknown section "${sub.section}".`, 400);
    const built = buildApplyPlan(sub.section, sub.payload, {
      collegeId: sub.college_id,
      nowIso,
      currentProvided: sub.colleges?.college_provided,
    });
    if (!built.ok) throw new DecisionError(built.error, 400);
    const { plan } = built;

    if (plan.fees?.length) {
      const { error: feeErr } = await from('college_fees').upsert(plan.fees, {
        onConflict: 'college_id,academic_year,year_number,fee_category',
      });
      if (feeErr) throw new DecisionError(`Could not save fees: ${feeErr.message}`, 500);
    }
    if (plan.infrastructure) {
      const { error: infraErr } = await from('college_infrastructure').upsert(plan.infrastructure, { onConflict: 'college_id' });
      if (infraErr) throw new DecisionError(`Could not save facilities: ${infraErr.message}`, 500);
    }
    const { error: colErr } = await from('colleges').update(plan.colleges).eq('id', sub.college_id);
    if (colErr) throw new DecisionError(`Could not update the college: ${colErr.message}`, 500);
  }

  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { data: marked, error: markErr } = await from('college_content_submissions')
    .update({ status, reviewed_at: nowIso, reviewed_by: staff, review_note: note?.trim() || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (markErr) throw new DecisionError(markErr.message, 500);
  if (!marked) throw new DecisionError('Someone else decided this submission at the same time.', 409);

  return { id, status, college };
}

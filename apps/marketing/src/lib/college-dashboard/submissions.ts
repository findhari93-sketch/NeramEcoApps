import type { CollegeContentSection } from '@/lib/college-hub/types';
import { changedKeys, cleanSubmission } from './content-sections';
import { photoUrlPrefix } from './photos';

export interface SubmitterInfo {
  /** college_admins.id for dashboard edits; null for update-link edits. */
  adminId: string | null;
  name: string;
  source: 'dashboard' | 'link';
  role?: string | null;
  phone?: string | null;
  updateLinkId?: string | null;
}

export type SaveResult =
  | { ok: true; id: string; submitted_at: string; changed: string[] }
  | { ok: false; kind: 'invalid'; errors: Record<string, string> }
  | { ok: false; kind: 'unchanged' };

/**
 * Checks one section's values and puts them in the staff review queue
 * (college_content_submissions). Shared by the college dashboard and the
 * no-login update link so both write exactly the same thing.
 *
 * Only changed fields go to staff, except fees: those are whole rows for one
 * academic year, so every amount is sent. A new edit replaces the section's
 * open pending edit.
 */
export async function saveSectionForReview(
  db: any,
  collegeId: string,
  section: CollegeContentSection,
  values: Record<string, unknown>,
  live: Record<string, unknown>,
  by: SubmitterInfo
): Promise<SaveResult> {
  const result = cleanSubmission(section, values, photoUrlPrefix(db, collegeId));
  if (!result.ok) return { ok: false, kind: 'invalid', errors: result.errors };

  const changed = changedKeys(result.payload, live);
  if (changed.length === 0) return { ok: false, kind: 'unchanged' };

  const payload = section === 'fees' ? result.payload : Object.fromEntries(changed.map((k) => [k, result.payload[k]]));
  const before = Object.fromEntries(Object.keys(payload).map((k) => [k, live[k] ?? null]));

  const row: Record<string, unknown> = {
    college_id: collegeId,
    section,
    payload,
    previous: before,
    submitted_by: by.adminId,
    submitted_by_name: by.name,
    submitted_at: new Date().toISOString(),
  };
  // The source columns are newer (20261128090000); dashboard rows leave them
  // at their defaults so this still writes on a database without them.
  if (by.source === 'link') {
    row.source = 'link';
    row.update_link_id = by.updateLinkId ?? null;
    row.submitter_role = by.role ?? null;
    row.submitter_phone = by.phone ?? null;
  }

  const { data: open } = await db
    .from('college_content_submissions')
    .select('id')
    .eq('college_id', collegeId)
    .eq('section', section)
    .eq('status', 'pending')
    .maybeSingle();
  const write = open
    ? db.from('college_content_submissions').update(row).eq('id', open.id).select('id, submitted_at').single()
    : db.from('college_content_submissions').insert(row).select('id, submitted_at').single();
  const { data, error } = await write;
  if (error) throw error;
  return { ok: true, id: data.id, submitted_at: data.submitted_at, changed };
}

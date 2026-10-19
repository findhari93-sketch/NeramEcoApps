/**
 * Completing a direct enrolment for someone who already has an application
 * (a demo person, or someone who applied before). The new answers fill the
 * row, but never at the cost of what is already there:
 *  - blank answers (null, undefined, '') are left out, so they never wipe a value;
 *  - `source`, `application_number` and `country` are set only when the row has none;
 *  - the enrolment note is appended to the staff notes, not written over them.
 * The student_profiles id stays the authoritative number for the enrolment.
 */
export function buildLeadProfileUpdate(
  existing: { source?: string | null; admin_notes?: string | null; application_number?: string | null; country?: string | null },
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') continue;
    update[key] = value;
  }
  if (existing.source) delete update.source;
  if (existing.application_number) delete update.application_number;
  if (existing.country) delete update.country;
  const note = typeof fields.admin_notes === 'string' ? fields.admin_notes : '';
  if (existing.admin_notes && note) update.admin_notes = `${existing.admin_notes}\n${note}`;
  else if (existing.admin_notes) delete update.admin_notes;
  return update;
}

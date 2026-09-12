/**
 * What the "Needs attention" card on the Students screen lists, in order.
 *
 * Most damaging first: two records for one person split fees and attendance, a
 * class and exam year that disagree put a student in the wrong cohort, a student
 * who never signed in is being taught nothing. A missing application form comes
 * next because it is usually WHY the class and exam year are empty, and the two
 * missing-data rows are housekeeping after it. Pure, so the order and the copy
 * are unit tested.
 */

export type AttentionKey =
  | 'duplicates'
  | 'mismatch'
  | 'never_signed_in'
  | 'no_form'
  | 'no_stage'
  | 'no_year';

export type AttentionActionKey =
  | 'review_duplicates'
  | 'review_mismatches'
  | 'show_never_signed_in'
  | 'review_forms'
  | 'prefill'
  | 'fix_stages'
  | 'fix_years';

export interface AttentionAction {
  key: AttentionActionKey;
  label: string;
  primary?: boolean;
  /** Changes data, so a caller without edit rights must not be offered it. */
  requiresEdit?: boolean;
}

export interface AttentionRow {
  key: AttentionKey;
  message: string;
  actions: AttentionAction[];
}

export interface AttentionInput {
  duplicateCount: number;
  mismatchCount: number;
  neverSignedInCount: number;
  /** Students whose own record holds no application form. Excludes dormant students. */
  noFormCount: number;
  noStageCount: number;
  noYearCount: number;
  suggestionCount: number;
}

function studentHas(count: number): string {
  return count === 1 ? 'student has' : 'students have';
}

export function buildAttentionRows(input: AttentionInput): AttentionRow[] {
  const rows: AttentionRow[] = [];

  if (input.duplicateCount > 0) {
    rows.push({
      key: 'duplicates',
      message: `${input.duplicateCount} ${input.duplicateCount === 1 ? 'student may' : 'students may'} have two records here. Merge them in Admin so fees and attendance stay together.`,
      actions: [{ key: 'review_duplicates', label: 'Review', primary: true }],
    });
  }

  if (input.mismatchCount > 0) {
    rows.push({
      key: 'mismatch',
      message: `${input.mismatchCount} ${studentHas(input.mismatchCount)} a class and exam year that disagree.`,
      actions: [{ key: 'review_mismatches', label: 'Review', primary: true, requiresEdit: true }],
    });
  }

  if (input.neverSignedInCount > 0) {
    rows.push({
      key: 'never_signed_in',
      message: `${input.neverSignedInCount} ${studentHas(input.neverSignedInCount)} never signed in to Nexus.`,
      actions: [{ key: 'show_never_signed_in', label: 'Show them' }],
    });
  }

  // Open to every teacher: seeing who has no form, and what might be theirs, is how
  // someone knows whom to ask. Linking a form is gated inside the sheet.
  if (input.noFormCount > 0) {
    rows.push({
      key: 'no_form',
      message: `${input.noFormCount} ${studentHas(input.noFormCount)} no application form linked, so their class and exam year cannot be filled in from it.`,
      actions: [{ key: 'review_forms', label: 'Find their forms', primary: true }],
    });
  }

  if (input.noStageCount > 0) {
    const actions: AttentionAction[] = [];
    if (input.suggestionCount > 0) {
      actions.push({ key: 'prefill', label: 'Fill from application form', primary: true, requiresEdit: true });
    }
    actions.push({ key: 'fix_stages', label: 'Set classes', primary: input.suggestionCount === 0, requiresEdit: true });
    rows.push({
      key: 'no_stage',
      message: `${input.noStageCount} ${studentHas(input.noStageCount)} no class set. Priority and reminders cannot be targeted until they do.`,
      actions,
    });
  }

  if (input.noYearCount > 0) {
    rows.push({
      key: 'no_year',
      message: `${input.noYearCount} ${studentHas(input.noYearCount)} no exam year, so they belong to no cohort.`,
      actions: [{ key: 'fix_years', label: 'Set exam year', requiresEdit: true }],
    });
  }

  return rows;
}

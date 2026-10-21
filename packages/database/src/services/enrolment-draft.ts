/**
 * Enrolment wizard drafts: continue from any device.
 *
 * Two things live on a link that a returning student may resume from:
 *  - the saved application (`submitted_form`, written by "pay later" and by
 *    the Instant UPI intent), read only by the account that saved it or the
 *    account the link was made for;
 *  - the draft (`draft_form`, written as the student moves through the
 *    wizard), read only by the account that wrote it or the account the
 *    link was made for.
 * The two owners are checked separately: writing a draft on a leaked link
 * must never reveal the saved application.
 */

export const DRAFT_MAX_BYTES = 16 * 1024;
const DRAFT_SECTIONS = ['personal', 'location', 'academic', 'payment'] as const;

export interface EnrolmentDraft {
  step: number;
  form: Record<string, Record<string, unknown>>;
}

export interface SavedApplication {
  form: Record<string, unknown>;
  scheme: 'full' | 'installment' | null;
  savedAt: string;
}

export interface StoredDraft extends EnrolmentDraft {
  savedAt: string;
}

export interface ResumeState {
  saved: SavedApplication | null;
  draft: StoredDraft | null;
}

type LinkLike = {
  user_id?: string | null;
  submitted_user_id?: string | null;
  submitted_form?: Record<string, unknown> | null;
  chosen_scheme?: 'full' | 'installment' | null;
  details_saved_at?: string | null;
  draft_user_id?: string | null;
  draft_form?: Record<string, unknown> | null;
  draft_step?: number | null;
  draft_saved_at?: string | null;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The wizard's PUT body, reduced to what is stored. The terms tick is not
 * stored: a student re-ticks it on a new device.
 */
export function normaliseDraft(body: unknown): { ok: true; draft: EnrolmentDraft } | { ok: false; error: string } {
  if (!isObject(body)) return { ok: false, error: 'A draft body is required.' };
  const step = body.step;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 3) return { ok: false, error: 'step must be 0 to 3.' };
  if (!isObject(body.formData)) return { ok: false, error: 'formData must be an object.' };
  const form: Record<string, Record<string, unknown>> = {};
  for (const section of DRAFT_SECTIONS) {
    const value = body.formData[section];
    if (value === undefined) continue;
    if (!isObject(value)) return { ok: false, error: `formData.${section} must be an object.` };
    form[section] = value;
  }
  if (JSON.stringify(form).length > DRAFT_MAX_BYTES) return { ok: false, error: 'The draft is too large.' };
  return { ok: true, draft: { step, form } };
}

/** What a signed-in person may resume on this link. Never throws, never leaks. */
export function resumeStateFor(link: LinkLike, userId: string | null | undefined): ResumeState {
  if (!userId) return { saved: null, draft: null };
  const isLinkAccount = Boolean(link.user_id) && link.user_id === userId;

  let saved: SavedApplication | null = null;
  if ((isLinkAccount || link.submitted_user_id === userId) && isObject(link.submitted_form) && link.details_saved_at) {
    saved = { form: link.submitted_form, scheme: link.chosen_scheme || null, savedAt: link.details_saved_at };
  }

  let draft: StoredDraft | null = null;
  if ((isLinkAccount || link.draft_user_id === userId) && isObject(link.draft_form) && link.draft_saved_at) {
    draft = {
      form: link.draft_form as Record<string, Record<string, unknown>>,
      step: typeof link.draft_step === 'number' ? link.draft_step : 0,
      savedAt: link.draft_saved_at,
    };
  }
  return { saved, draft };
}

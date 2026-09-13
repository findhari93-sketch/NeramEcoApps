/**
 * An AI draft on the review screen: what it prefills, what it leaves to the
 * teacher, and when unread drafts may be approved in bulk.
 *
 * The draft turns composing into agreeing, but only where it is sure. A
 * criterion the model marked HIGH confidence arrives scored and read-only, one
 * tap to change. Anything less arrives as a hint beside an empty row: "Draft
 * says 3, unsure. Your call." Prefilling an unsure score would let a teacher
 * approve a guess without ever deciding it.
 *
 * Nothing here calls a model. Drafts exist only once someone has switched
 * evaluation on and pressed Draft this; until then every function answers as
 * if there were no draft, which is the honest state.
 */

import type { Band, BandMap } from './drawing-rubric';

export type Confidence = 'high' | 'medium' | 'low';

export interface AiDraftCriterion {
  ai_band: number;
  confidence: Confidence | null;
  reasoning: string | null;
}

export interface AiDraftMark {
  id: string;
  criterion_key: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  marker: string | null;
  comment: string | null;
  /** False draws the mark dashed: the model was not sure of the criterion it belongs to. */
  confident: boolean;
}

export interface AiDraft {
  evaluation_id: string;
  created_at: string;
  overall_comment: string | null;
  criteria: Record<string, AiDraftCriterion>;
  marks: AiDraftMark[];
}

const isBand = (n: unknown): n is Band => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;

export const isConfident = (c: Confidence | null | undefined) => c === 'high';

/**
 * The bands the rubric opens with. A score the teacher already saved always
 * wins; a confident draft band fills a gap; an unsure one never does.
 */
export function prefillBands(draft: AiDraft | null, saved: BandMap): BandMap {
  const out: BandMap = { ...saved };
  if (!draft) return out;
  for (const [key, c] of Object.entries(draft.criteria)) {
    if (out[key] == null && isConfident(c.confidence) && isBand(c.ai_band)) out[key] = c.ai_band;
  }
  return out;
}

export type RowMode = 'input' | 'confirmed' | 'suggested';

/**
 * How one criterion row renders.
 *  - confirmed: a confident draft band the teacher has not changed or unlocked.
 *  - suggested: an unsure draft, shown as a hint beside an ordinary row.
 *  - input: no draft for this criterion, or the teacher took it over.
 */
export function rowMode(key: string, draft: AiDraft | null, band: number | undefined, unlocked: boolean): RowMode {
  const c = draft?.criteria[key];
  if (!c || !isBand(c.ai_band) || unlocked) return 'input';
  if (isConfident(c.confidence)) return band === c.ai_band ? 'confirmed' : 'input';
  return 'suggested';
}

/** The main action's name. "Approve" only when there is a draft to approve. */
export function completeLabel({ hasDraft, alreadyReviewed }: { hasDraft: boolean; alreadyReviewed: boolean }): string {
  if (alreadyReviewed) return 'Save';
  return hasDraft ? 'Approve' : 'Complete';
}

/** The written feedback to open with: the teacher's own text, else the draft's. */
export function feedbackPrefill(current: string | null | undefined, draft: AiDraft | null): string | null {
  if (current && current.trim()) return null;
  const text = draft?.overall_comment?.trim();
  return text ? text : null;
}

// Shadow agreement ------------------------------------------------------------

export interface ScorePair {
  submission_id: string;
  criterion_key: string;
  ai_band: number;
  final_band: number;
}

export interface CriterionAgreement {
  criterion_key: string;
  compared: number;
  exact: number;
  withinOne: number;
}

export interface ShadowAgreement {
  sheets: number;
  pairs: number;
  criteria: CriterionAgreement[];
}

/**
 * Sheets that must be graded by a teacher beside a silent draft before unread
 * drafts may be approved in bulk. A holdout this size is the smallest that
 * says anything per criterion at this school's volume.
 */
export const SHADOW_MIN_SHEETS = 50;
/**
 * Share of criterion scores, per criterion, the draft must land within one band
 * of the teacher's. Deliberately a floor for the gate, not a figure to display:
 * the screen shows counts.
 */
export const SHADOW_MIN_WITHIN_ONE = 0.9;

export function shadowAgreement(pairs: ScorePair[]): ShadowAgreement {
  const valid = pairs.filter((p) => isBand(p.ai_band) && isBand(p.final_band));
  const byKey = new Map<string, CriterionAgreement>();
  for (const p of valid) {
    const row = byKey.get(p.criterion_key) ?? { criterion_key: p.criterion_key, compared: 0, exact: 0, withinOne: 0 };
    row.compared += 1;
    if (p.ai_band === p.final_band) row.exact += 1;
    if (Math.abs(p.ai_band - p.final_band) <= 1) row.withinOne += 1;
    byKey.set(p.criterion_key, row);
  }
  return {
    sheets: new Set(valid.map((p) => p.submission_id)).size,
    pairs: valid.length,
    criteria: Array.from(byKey.values()).sort((a, b) => a.criterion_key.localeCompare(b.criterion_key)),
  };
}

export interface ReleaseGate {
  ready: boolean;
  reason: string;
}

/** Whether unread drafts may be approved in bulk, and why not. */
export function unreadDraftsGate(agreement: ShadowAgreement): ReleaseGate {
  if (agreement.sheets < SHADOW_MIN_SHEETS) {
    return {
      ready: false,
      reason: `Approving drafts unread unlocks after ${SHADOW_MIN_SHEETS} sheets are graded beside a draft. ${agreement.sheets} of ${SHADOW_MIN_SHEETS} so far.`,
    };
  }
  const weak = agreement.criteria.filter((c) => c.compared > 0 && c.withinOne / c.compared < SHADOW_MIN_WITHIN_ONE);
  if (weak.length > 0) {
    const names = weak.map((c) => `${c.criterion_key.replace(/_/g, ' ')} (${c.withinOne} of ${c.compared} within one band)`).join(', ');
    return { ready: false, reason: `The draft is not close enough to your grading yet on ${names}. Keep reviewing these by hand.` };
  }
  return { ready: true, reason: `Graded beside ${agreement.sheets} sheets and within one band of you on every criterion.` };
}

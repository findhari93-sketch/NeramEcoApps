/**
 * Grading rules: sentences a teacher chose to keep about how they grade.
 *
 * A rule is shown back while grading, so the teacher's own standard is in front
 * of them at the moment it applies. It never changes a score by itself. The one
 * thing a rule can do to other work is FIND it: drafts where the model made the
 * same call the teacher just corrected. Those are offered as "Show me the 3",
 * opened one by one, because a silent bulk change to grades students will
 * receive is exactly what hold-and-release exists to prevent.
 *
 * Until AI drafts exist nothing has an ai_band, so a rule finds nothing, and the
 * offer simply does not appear. That is the honest answer, not a gap.
 */

export interface GradingRule {
  id: string;
  teacher_id: string;
  brief_type_id: string | null;
  criterion_key: string | null;
  reason_code: string | null;
  text: string;
  is_active: boolean;
  applied_count: number;
  created_at: string;
}

export interface OpenDraftCriterion {
  submission_id: string;
  /** Who the draft belongs to: the teacher who asked for it. */
  teacher_id: string | null;
  brief_type_id: string | null;
  criterion_key: string;
  ai_band: number | null;
  was_corrected: boolean;
  released: boolean;
}

export const MIN_RULE_TEXT = 3;
export const MAX_RULE_TEXT = 400;

/** A rule's text off the wire, tidied, or null when it is not a sentence. */
export function cleanRuleText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length < MIN_RULE_TEXT || text.length > MAX_RULE_TEXT) return null;
  return text;
}

function scopeFits(rule: Pick<GradingRule, 'criterion_key' | 'brief_type_id'>, criterionKey: string, briefTypeId: string | null) {
  if (rule.criterion_key && rule.criterion_key !== criterionKey) return false;
  if (rule.brief_type_id && rule.brief_type_id !== briefTypeId) return false;
  return true;
}

/** The active rules that speak to one criterion, the most specific first. */
export function rulesForCriterion(rules: GradingRule[], criterionKey: string, briefTypeId: string | null = null): GradingRule[] {
  const specificity = (r: GradingRule) => (r.criterion_key ? 2 : 0) + (r.brief_type_id ? 1 : 0);
  return rules
    .filter((r) => r.is_active && scopeFits(r, criterionKey, briefTypeId))
    .sort((a, b) => specificity(b) - specificity(a) || b.created_at.localeCompare(a.created_at));
}

/**
 * Whether a correction just made should offer to open this draft.
 *
 * Same teacher, same criterion (and brief when the rule names one), not yet
 * released, not already corrected, and the model made the same call the
 * teacher just overrode.
 */
export function draftMatches(
  rule: Pick<GradingRule, 'teacher_id' | 'criterion_key' | 'brief_type_id' | 'is_active'>,
  correctedFromBand: number,
  draft: OpenDraftCriterion,
): boolean {
  if (!rule.is_active || draft.released || draft.was_corrected) return false;
  if (draft.teacher_id !== rule.teacher_id) return false;
  if (!scopeFits(rule, draft.criterion_key, draft.brief_type_id)) return false;
  return draft.ai_band === correctedFromBand;
}

/** The submissions to offer, each once, excluding the one just corrected. */
export function matchingDrafts(
  rule: Pick<GradingRule, 'teacher_id' | 'criterion_key' | 'brief_type_id' | 'is_active'>,
  correctedFromBand: number,
  drafts: OpenDraftCriterion[],
  exceptSubmissionId: string,
): string[] {
  const ids = drafts
    .filter((d) => d.submission_id !== exceptSubmissionId && draftMatches(rule, correctedFromBand, d))
    .map((d) => d.submission_id);
  return Array.from(new Set(ids));
}

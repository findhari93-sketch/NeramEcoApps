import { describe, it, expect } from 'vitest';
import { cleanRuleText, draftMatches, matchingDrafts, rulesForCriterion, type GradingRule, type OpenDraftCriterion } from './drawing-grading-rules';

const rule = (over: Partial<GradingRule> = {}): GradingRule => ({
  id: 'r1', teacher_id: 't1', brief_type_id: null, criterion_key: 'proportion', reason_code: 'too_small',
  text: 'A real error too small to move a band stays in the band', is_active: true, applied_count: 0,
  created_at: '2026-09-13T10:00:00Z', ...over,
});

const draft = (over: Partial<OpenDraftCriterion> = {}): OpenDraftCriterion => ({
  submission_id: 's2', teacher_id: 't1', brief_type_id: null, criterion_key: 'proportion',
  ai_band: 2, was_corrected: false, released: false, ...over,
});

describe('draftMatches', () => {
  it('finds a draft where the model made the call the teacher just corrected', () => {
    expect(draftMatches(rule(), 2, draft())).toBe(true);
  });

  it('never a released evaluation', () => {
    expect(draftMatches(rule(), 2, draft({ released: true }))).toBe(false);
  });

  it("never another teacher's", () => {
    expect(draftMatches(rule(), 2, draft({ teacher_id: 't2' }))).toBe(false);
  });

  it('never one already corrected, nor a different criterion, nor a different call', () => {
    expect(draftMatches(rule(), 2, draft({ was_corrected: true }))).toBe(false);
    expect(draftMatches(rule(), 2, draft({ criterion_key: 'composition' }))).toBe(false);
    expect(draftMatches(rule(), 2, draft({ ai_band: 3 }))).toBe(false);
  });

  it('finds nothing without a model draft, which is the honest answer today', () => {
    expect(draftMatches(rule(), 2, draft({ ai_band: null }))).toBe(false);
  });

  it('respects a brief the rule names', () => {
    const scoped = rule({ brief_type_id: 'b1' });
    expect(draftMatches(scoped, 2, draft({ brief_type_id: 'b1' }))).toBe(true);
    expect(draftMatches(scoped, 2, draft({ brief_type_id: 'b2' }))).toBe(false);
  });

  it('a retired rule finds nothing', () => {
    expect(draftMatches(rule({ is_active: false }), 2, draft())).toBe(false);
  });
});

describe('matchingDrafts', () => {
  it('lists each submission once and never the one just corrected', () => {
    const drafts = [draft({ submission_id: 's1' }), draft({ submission_id: 's2' }), draft({ submission_id: 's2' }), draft({ submission_id: 's3', ai_band: 4 })];
    expect(matchingDrafts(rule(), 2, drafts, 's1')).toEqual(['s2']);
  });
});

describe('rulesForCriterion', () => {
  it('shows rules for this criterion and general ones, specific first, retired never', () => {
    const rules = [
      rule({ id: 'general', criterion_key: null, created_at: '2026-09-14T00:00:00Z' }),
      rule({ id: 'specific' }),
      rule({ id: 'other', criterion_key: 'composition' }),
      rule({ id: 'retired', is_active: false }),
    ];
    expect(rulesForCriterion(rules, 'proportion').map((r) => r.id)).toEqual(['specific', 'general']);
  });
});

describe('cleanRuleText', () => {
  it('tidies a sentence and refuses what is not one', () => {
    expect(cleanRuleText('  Shadows   fall one way ')).toBe('Shadows fall one way');
    expect(cleanRuleText('ok')).toBeNull();
    expect(cleanRuleText('x'.repeat(401))).toBeNull();
    expect(cleanRuleText(42)).toBeNull();
  });
});

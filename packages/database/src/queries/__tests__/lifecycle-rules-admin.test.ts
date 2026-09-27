// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateLearnerTestimonial } from '../learner-feedback';
import { sanitizeLifecycleRules, DEFAULT_LIFECYCLE_RULES } from '../lifecycle-admin';
import { istDayBounds } from '../crm-follow-ups';
import { chooseSurvivorOrder, orderPair } from '../duplicates';

const now = new Date('2026-09-25T12:00:00Z');
const valid = {
  text: 'The drawing classes helped me a lot with composition and speed.',
  rating: 5,
  examType: 'NATA' as const,
  year: 2026,
  city: 'Chennai',
  displayName: 'Priya S.',
  consentToPublish: true,
  isMinor: false,
};

describe('validateLearnerTestimonial', () => {
  it('accepts a complete adult submission', () => {
    expect(validateLearnerTestimonial(valid, now)).toEqual({ ok: true, errors: {} });
  });

  it('needs a guardian before a minor can be published', () => {
    const r = validateLearnerTestimonial({ ...valid, isMinor: true }, now);
    expect(r.ok).toBe(false);
    expect(r.errors.guardianConsent).toMatch(/parent or guardian/);
    expect(validateLearnerTestimonial({ ...valid, isMinor: true, guardianConsent: true }, now).ok).toBe(true);
  });

  it('a private testimonial needs no display name or guardian', () => {
    expect(validateLearnerTestimonial({ ...valid, consentToPublish: false, displayName: '', isMinor: true }, now).ok).toBe(true);
  });

  it('rejects short text, bad ratings, unknown exams and far-future years', () => {
    const r = validateLearnerTestimonial({ ...valid, text: 'ok', rating: 6, examType: 'GATE' as any, year: 2040, city: ' ' }, now);
    expect(Object.keys(r.errors).sort()).toEqual(['city', 'examType', 'rating', 'text', 'year']);
  });
});

describe('sanitizeLifecycleRules', () => {
  it('keeps defaults for missing keys and clamps nothing silently', () => {
    expect(sanitizeLifecycleRules({})).toEqual({ rules: DEFAULT_LIFECYCLE_RULES, errors: [] });
    const r = sanitizeLifecycleRules({ student_quiet_days: 2 });
    expect(r.errors[0]).toMatch(/student_quiet_days/);
    expect(r.rules.student_quiet_days).toBe(21);
  });

  it('refuses deactivation before archive and dedupes reminder days', () => {
    expect(sanitizeLifecycleRules({ lead_archive_days: 400, archived_deactivate_days: 300 }).errors.join(' ')).toMatch(
      /later than archiving/,
    );
    expect(sanitizeLifecycleRules({ join_reminder_days: [7, 1, 3, 3] }).rules.join_reminder_days).toEqual([1, 3, 7]);
    expect(sanitizeLifecycleRules({ join_reminder_days: [0] }).errors).toHaveLength(1);
  });
});

describe('istDayBounds', () => {
  it('uses the India calendar day', () => {
    // 20:00 UTC on the 25th is 01:30 on the 26th in India.
    const { start, end } = istDayBounds(new Date('2026-09-25T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-09-25T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-09-26T18:30:00.000Z');
  });
});

describe('duplicate pair helpers', () => {
  it('orders a pair the way the table stores it', () => {
    expect(orderPair('b', 'a')).toEqual(['a', 'b']);
  });

  it('with no org email, the row more records point at survives, then the older one', () => {
    const x = { id: 'x', email: 'a@gmail.com', created_at: '2026-01-02' };
    const y = { id: 'y', email: 'b@gmail.com', created_at: '2026-01-01' };
    expect(chooseSurvivorOrder(x, y, { x: 5, y: 40 })[0].id).toBe('y');
    expect(chooseSurvivorOrder(x, y, { x: 40, y: 5 })[0].id).toBe('x');
    expect(chooseSurvivorOrder(x, y, { x: 3, y: 3 })[0].id).toBe('y');
  });

  it('leaves the org-email rule to buildMergePreview', () => {
    const org = { id: 'o', email: 'a@neramclasses.com' };
    const gmail = { id: 'g', email: 'a@gmail.com' };
    expect(chooseSurvivorOrder(gmail, org, { g: 99, o: 0 }).map((r) => r.id)).toEqual(['g', 'o']);
  });
});

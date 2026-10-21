import { describe, it, expect } from 'vitest';
import { normaliseDraft, resumeStateFor, DRAFT_MAX_BYTES } from './enrolment-draft';

const LINK = {
  id: 'link-1',
  status: 'active',
  user_id: null as string | null,
  submitted_user_id: 'student' as string | null,
  submitted_form: { firstName: 'Radhika', applicantCategory: 'school_student' },
  chosen_scheme: 'full' as 'full' | 'installment' | null,
  details_saved_at: '2026-10-20T17:20:52.000Z',
  draft_user_id: 'student' as string | null,
  draft_form: { personal: { firstName: 'Radhik' } },
  draft_step: 1 as number | null,
  draft_saved_at: '2026-10-20T17:10:00.000Z',
};

describe('normaliseDraft', () => {
  it('keeps only the wizard sections and the step', () => {
    const r = normaliseDraft({
      step: 2,
      termsAccepted: true,
      formData: { personal: { firstName: 'R' }, location: { city: 'Chennai' }, academic: {}, payment: { paymentType: 'full' }, course: { x: 1 }, utmSource: 'ads' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.step).toBe(2);
    expect('termsAccepted' in r.draft).toBe(false);
    expect(Object.keys(r.draft.form).sort()).toEqual(['academic', 'location', 'payment', 'personal']);
  });

  it('refuses a step outside the wizard and a form that is not an object', () => {
    expect(normaliseDraft({ step: 4, formData: { personal: {} } }).ok).toBe(false);
    expect(normaliseDraft({ step: -1, formData: { personal: {} } }).ok).toBe(false);
    expect(normaliseDraft({ step: 'two', formData: { personal: {} } }).ok).toBe(false);
    expect(normaliseDraft({ step: 1, formData: 'nope' }).ok).toBe(false);
    expect(normaliseDraft({ step: 1, formData: { personal: 'nope' } }).ok).toBe(false);
  });

  it('refuses a draft larger than the cap', () => {
    const r = normaliseDraft({ step: 1, formData: { personal: { address: 'x'.repeat(DRAFT_MAX_BYTES) } } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/too large/i);
  });

});

describe('resumeStateFor', () => {
  it('gives the student who saved both the pay-later details and the draft', () => {
    const r = resumeStateFor(LINK, 'student');
    expect(r.saved).toEqual({ form: LINK.submitted_form, scheme: 'full', savedAt: LINK.details_saved_at });
    expect(r.draft).toEqual({ form: LINK.draft_form, step: 1, savedAt: LINK.draft_saved_at });
  });

  it('never shows the saved application to someone who only wrote a draft on a leaked link', () => {
    const r = resumeStateFor({ ...LINK, draft_user_id: 'stranger' }, 'stranger');
    expect(r.saved).toBeNull();
    expect(r.draft?.form).toEqual(LINK.draft_form);
  });

  it('shows nothing to a signed-in person who neither saved nor drafted', () => {
    expect(resumeStateFor(LINK, 'someone-else')).toEqual({ saved: null, draft: null });
    expect(resumeStateFor(LINK, null)).toEqual({ saved: null, draft: null });
  });

  it('lets the account the link was made for read both, so a merged demo sign-in still resumes', () => {
    const r = resumeStateFor({ ...LINK, user_id: 'demo-account', submitted_user_id: 'shell', draft_user_id: 'shell' }, 'demo-account');
    expect(r.saved?.form).toEqual(LINK.submitted_form);
    expect(r.draft?.step).toBe(1);
  });

  it('returns null parts when the link has no saved details or no draft', () => {
    const r = resumeStateFor({ ...LINK, submitted_form: null, details_saved_at: null, draft_form: null, draft_saved_at: null }, 'student');
    expect(r).toEqual({ saved: null, draft: null });
  });
});

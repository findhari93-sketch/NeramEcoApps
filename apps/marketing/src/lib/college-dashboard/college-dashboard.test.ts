import { describe, it, expect } from 'vitest';
import { can, normalizeRole } from './permissions';
import { changedKeys, cleanSubmission } from './content-sections';
import { sectionFilled } from './completeness';
import { isTestEmail } from './email';
import { leadStatusLabel, maskPhone, showsFullPhone } from './leads';

const PREFIX = 'https://db.example/storage/v1/object/public/college-photos/college-submitted/c1/';

describe('college roles', () => {
  it('owners do everything, editors all but the team, viewers only look', () => {
    expect(can('owner', 'manage_team')).toBe(true);
    expect(can('editor', 'manage_team')).toBe(false);
    expect(can('editor', 'edit_content')).toBe(true);
    expect(can('editor', 'manage_leads')).toBe(true);
    expect(can('viewer', 'edit_content')).toBe(false);
    expect(can('viewer', 'view')).toBe(true);
  });

  it('treats the old admin role as owner and anything unknown as viewer', () => {
    expect(normalizeRole('admin')).toBe('owner');
    expect(normalizeRole('superuser')).toBe('viewer');
    expect(can(undefined, 'edit_content')).toBe(false);
  });
});

describe('cleanSubmission', () => {
  it('keeps valid fee numbers and needs an academic year', () => {
    const missingYear = cleanSubmission('fees', { tuition: '1,85,000' }, PREFIX);
    expect(missingYear.ok).toBe(false);
    const ok = cleanSubmission('fees', { academic_year: '2026-27', tuition: '1,85,000', hostel: '', mess: '60000' }, PREFIX);
    expect(ok).toEqual({ ok: true, payload: { academic_year: '2026-27', tuition: 185000, hostel: null, mess: 60000 } });
  });

  it('rejects bad values with a message per field', () => {
    const r = cleanSubmission('profile', { admissions_email: 'not-an-email', website: 'javascript:alert(1)' }, PREFIX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.admissions_email).toBeTruthy();
      expect(r.errors.website).toBeTruthy();
    }
  });

  it('drops unknown keys and options that are not on the list', () => {
    const r = cleanSubmission('admissions', { neram_tier: 'platinum', accepted_exams: ['NATA', 'Hacked'], has_nri_quota: true }, PREFIX);
    expect(r).toEqual({ ok: true, payload: { accepted_exams: ['NATA'], has_nri_quota: true } });
  });

  it('only accepts photos uploaded to the college folder', () => {
    expect(cleanSubmission('photos', { hero_image_url: `${PREFIX}a.jpg` }, PREFIX).ok).toBe(true);
    expect(cleanSubmission('photos', { hero_image_url: 'https://evil.example/a.jpg' }, PREFIX).ok).toBe(false);
    expect(cleanSubmission('photos', { gallery_images: [`${PREFIX}a.jpg`, 'https://x.example/b.jpg'] }, PREFIX).ok).toBe(false);
  });

  it('needs both halves of a map pin and keeps them in range', () => {
    expect(cleanSubmission('location', { latitude: '12.83' }, PREFIX).ok).toBe(false);
    expect(cleanSubmission('location', { latitude: '120', longitude: '79' }, PREFIX).ok).toBe(false);
    expect(cleanSubmission('location', { latitude: '12.8342', longitude: '79.7036' }, PREFIX)).toEqual({
      ok: true,
      payload: { latitude: 12.8342, longitude: 79.7036 },
    });
  });

  it('checks the admission dates are in order', () => {
    const r = cleanSubmission('admissions', { admission_opens_on: '2027-05-01', admission_closes_on: '2027-04-01' }, PREFIX);
    expect(r.ok).toBe(false);
  });
});

describe('changedKeys', () => {
  it('lists only fields that differ from what is live', () => {
    expect(changedKeys({ tuition: 185000, hostel: null, academic_year: '2026-27' }, { tuition: '185000', hostel: null, academic_year: '2025-26' })).toEqual([
      'academic_year',
    ]);
    expect(changedKeys({ accepted_exams: ['NATA'] }, { accepted_exams: ['NATA', 'JEE Main Paper 2'] })).toEqual(['accepted_exams']);
    expect(changedKeys({ total_barch_seats: 0 }, { total_barch_seats: null })).toEqual(['total_barch_seats']);
  });
});

describe('dashboard helpers', () => {
  it('marks a section filled only when its key fields are there', () => {
    expect(sectionFilled('fees', { tuition: null })).toBe(false);
    expect(sectionFilled('fees', { tuition: 150000 })).toBe(true);
    expect(sectionFilled('facilities', { has_hostel_boys: false, design_studios: null })).toBe(false);
    expect(sectionFilled('facilities', { has_hostel_girls: true })).toBe(true);
  });

  it('never emails test addresses', () => {
    expect(isTestEmail('papni-owner@neram.test')).toBe(true);
    expect(isTestEmail('someone@example.com')).toBe(true);
    expect(isTestEmail('principal@papniarch.ac.in')).toBe(false);
  });

  it('masks phones below Gold and labels statuses', () => {
    expect(showsFullPhone('silver')).toBe(false);
    expect(showsFullPhone('gold')).toBe(true);
    expect(maskPhone('9876543210')).toBe('98XXXXXX10');
    expect(leadStatusLabel('admitted')).toBe('Took admission');
    expect(leadStatusLabel('converted')).toBe('Took admission');
  });
});

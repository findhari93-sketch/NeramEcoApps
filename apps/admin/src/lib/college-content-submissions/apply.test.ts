// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildApplyPlan, diffSubmission, pickFields, stampProvided } from './apply';

const NOW = '2026-10-15T06:00:00.000Z';
const ctx = { collegeId: 'col-1', nowIso: NOW, currentProvided: { fees: '2026-01-01T00:00:00.000Z' } };

const stamps = {
  college_provided: { fees: '2026-01-01T00:00:00.000Z', profile: NOW },
  last_data_update: NOW,
  updated_at: NOW,
};

describe('stampProvided', () => {
  it('adds the section and keeps the others', () => {
    expect(stampProvided({ fees: 'a' }, 'photos', NOW)).toEqual({ fees: 'a', photos: NOW });
    expect(stampProvided(null, 'fees', NOW)).toEqual({ fees: NOW });
    expect(stampProvided(['x'], 'fees', NOW)).toEqual({ fees: NOW });
  });
});

describe('profile', () => {
  it('writes known keys to colleges, ignores unknown keys, null clears, trims text', () => {
    const r = buildApplyPlan(
      'profile',
      { about: '  Est. 1995 ', website: 'https://papni.edu.in', instagram_handle: null, highlights: ['COA approved', ' ', 'COA approved'], hack: 'x' },
      ctx,
    );
    expect(r).toEqual({
      ok: true,
      plan: {
        colleges: {
          about: 'Est. 1995',
          website: 'https://papni.edu.in',
          instagram_handle: null,
          highlights: ['COA approved'],
          ...stamps,
        },
      },
    });
  });

  it('refuses a website that is not a web link', () => {
    const r = buildApplyPlan('profile', { website: 'javascript:alert(1)' }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe('admissions', () => {
  it('maps seats, lists, quotas and dates', () => {
    const r = buildApplyPlan(
      'admissions',
      {
        total_barch_seats: '60',
        accepted_exams: ['NATA', 'JEE Paper 2'],
        counseling_systems: ['TNEA'],
        has_management_quota: true,
        has_nri_quota: false,
        admission_opens_on: '2027-05-01',
        admission_closes_on: '2027-07-31',
        brochure_url: null,
        scholarships_text: 'Merit scholarships for NATA 140+',
      },
      ctx,
    );
    expect(r.ok && r.plan.colleges).toMatchObject({
      total_barch_seats: 60,
      accepted_exams: ['NATA', 'JEE Paper 2'],
      has_management_quota: true,
      has_nri_quota: false,
      admission_opens_on: '2027-05-01',
      brochure_url: null,
    });
  });

  it('refuses a close date before the open date, and bad dates', () => {
    expect(buildApplyPlan('admissions', { admission_opens_on: '2027-07-01', admission_closes_on: '2027-05-01' }, ctx).ok).toBe(false);
    expect(buildApplyPlan('admissions', { admission_opens_on: '01/05/2027' }, ctx).ok).toBe(false);
    expect(buildApplyPlan('admissions', { has_nri_quota: 'yes' }, ctx).ok).toBe(false);
  });
});

describe('fees', () => {
  it('upserts five general rows with the same amounts and sets annual_fee_approx from tuition', () => {
    const r = buildApplyPlan(
      'fees',
      { academic_year: '2026-27', tuition: 125000.4, hostel: 60000, mess: null, other_fees: 5000, caution_deposit: 10000 },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.fees).toHaveLength(5);
    expect(r.plan.fees?.map((f) => f.year_number)).toEqual([1, 2, 3, 4, 5]);
    expect(r.plan.fees?.[2]).toEqual({
      college_id: 'col-1',
      academic_year: '2026-27',
      year_number: 3,
      fee_category: 'general',
      tuition: 125000.4,
      hostel: 60000,
      mess: null,
      other_fees: 5000,
      caution_deposit: 10000,
      verified: true,
      verified_source: 'college',
      updated_at: NOW,
    });
    expect(r.plan.colleges).toEqual({ ...stamps, college_provided: { fees: NOW }, annual_fee_approx: 125000 });
  });

  it('leaves annual_fee_approx alone when tuition is not given', () => {
    const r = buildApplyPlan('fees', { academic_year: '2026-27', hostel: 1 }, ctx);
    expect(r.ok && 'annual_fee_approx' in r.plan.colleges).toBe(false);
    expect(r.ok && 'tuition' in (r.plan.fees?.[0] ?? {})).toBe(false);
  });

  it('needs a valid academic year and non-negative amounts', () => {
    expect(buildApplyPlan('fees', { tuition: 1 }, ctx).ok).toBe(false);
    expect(buildApplyPlan('fees', { academic_year: '2026', tuition: 1 }, ctx).ok).toBe(false);
    expect(buildApplyPlan('fees', { academic_year: '2026-27', tuition: -1 }, ctx).ok).toBe(false);
  });
});

describe('facilities', () => {
  it('upserts college_infrastructure and only stamps colleges', () => {
    const r = buildApplyPlan(
      'facilities',
      { design_studios: 6.2, has_wifi: true, campus_area_acres: 12.5, software_available: ['AutoCAD', 'Revit'], unknown: 1 },
      ctx,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.plan.infrastructure).toEqual({
      college_id: 'col-1',
      design_studios: 6,
      has_wifi: true,
      campus_area_acres: 12.5,
      software_available: ['AutoCAD', 'Revit'],
      updated_at: NOW,
    });
    expect(r.plan.colleges).toEqual({ ...stamps, college_provided: { fees: '2026-01-01T00:00:00.000Z', facilities: NOW } });
  });
});

describe('location', () => {
  it('writes address and the pin', () => {
    const r = buildApplyPlan('location', { address: 'Madurai', latitude: 9.93, longitude: 78.12, railway_distance_km: '4.5' }, ctx);
    expect(r.ok && r.plan.colleges).toMatchObject({ address: 'Madurai', latitude: 9.93, longitude: 78.12, railway_distance_km: 4.5 });
  });

  it('refuses out-of-range coordinates or a half pin', () => {
    expect(buildApplyPlan('location', { latitude: 91, longitude: 78 }, ctx).ok).toBe(false);
    expect(buildApplyPlan('location', { latitude: 9, longitude: -181 }, ctx).ok).toBe(false);
    expect(buildApplyPlan('location', { latitude: 9 }, ctx).ok).toBe(false);
    expect(buildApplyPlan('location', { latitude: 9, longitude: null }, ctx).ok).toBe(false);
  });

  it('allows clearing the pin with both null', () => {
    const r = buildApplyPlan('location', { latitude: null, longitude: null }, ctx);
    expect(r.ok && r.plan.colleges).toMatchObject({ latitude: null, longitude: null });
  });
});

describe('photos', () => {
  it('writes photos and marks them manual so the photo job leaves them', () => {
    const r = buildApplyPlan(
      'photos',
      { hero_image_url: 'https://cdn.x/hero.jpg', logo_url: null, gallery_images: ['https://cdn.x/1.jpg', 'https://cdn.x/2.jpg'] },
      ctx,
    );
    expect(r.ok && r.plan.colleges).toMatchObject({
      hero_image_url: 'https://cdn.x/hero.jpg',
      logo_url: null,
      gallery_images: ['https://cdn.x/1.jpg', 'https://cdn.x/2.jpg'],
      photo_status: 'manual',
    });
  });

  it('refuses a gallery item that is not a web link', () => {
    expect(buildApplyPlan('photos', { gallery_images: ['data:image/png;base64,xx'] }, ctx).ok).toBe(false);
  });
});

describe('pickFields', () => {
  it('refuses an empty or non-object payload', () => {
    expect(pickFields('profile', null).ok).toBe(false);
    expect(pickFields('profile', ['a']).ok).toBe(false);
  });
});

describe('diffSubmission', () => {
  it('lists payload fields with before and after, marking real changes only', () => {
    const rows = diffSubmission(
      'fees',
      { academic_year: '2026-27', tuition: 120000, hostel: '60000', mess: null },
      { academic_year: '2026-27', tuition: 125000, hostel: 60000, mess: null, hack: 1 },
    );
    expect(rows.map((r) => [r.key, r.changed])).toEqual([
      ['academic_year', false],
      ['tuition', true],
      ['hostel', false],
      ['mess', false],
    ]);
    expect(rows[1]).toMatchObject({ label: 'Tuition (per year)', before: 120000, after: 125000 });
  });

  it('treats a missing previous as empty and compares lists by value', () => {
    const rows = diffSubmission('profile', null, { highlights: ['A'], about: '' });
    expect(rows.find((r) => r.key === 'highlights')?.changed).toBe(true);
    expect(rows.find((r) => r.key === 'about')?.changed).toBe(false);
    const same = diffSubmission('profile', { highlights: ['A', 'B'] }, { highlights: ['A', 'B'] });
    expect(same[0].changed).toBe(false);
  });
});

/**
 * What approving a college's content submission writes, as pure functions.
 *
 * The marketing college dashboard writes `payload` in the shapes below. Here
 * each section turns into plain update objects for colleges, college_fees and
 * college_infrastructure. Unknown keys are ignored, a key that is absent is
 * left alone, and null clears the value. Nothing here touches the database;
 * runner.ts does that.
 */

export const SECTIONS = ['profile', 'fees', 'admissions', 'facilities', 'location', 'photos'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  profile: 'Profile',
  fees: 'Fees',
  admissions: 'Admissions',
  facilities: 'Facilities',
  location: 'Location and map pin',
  photos: 'Photos',
};

export function isSection(v: unknown): v is Section {
  return typeof v === 'string' && (SECTIONS as readonly string[]).includes(v);
}

export type FieldKind = 'text' | 'url' | 'number' | 'integer' | 'bool' | 'list' | 'date' | 'image' | 'images';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
}

export const SECTION_FIELDS: Record<Section, FieldDef[]> = {
  profile: [
    { key: 'about', label: 'About', kind: 'text' },
    { key: 'phone', label: 'Phone', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'text' },
    { key: 'admissions_phone', label: 'Admissions phone', kind: 'text' },
    { key: 'admissions_email', label: 'Admissions email', kind: 'text' },
    { key: 'website', label: 'Website', kind: 'url' },
    { key: 'youtube_channel_url', label: 'YouTube channel', kind: 'url' },
    { key: 'instagram_handle', label: 'Instagram', kind: 'text' },
    { key: 'highlights', label: 'Highlights', kind: 'list' },
  ],
  admissions: [
    { key: 'total_barch_seats', label: 'B.Arch seats', kind: 'integer' },
    { key: 'accepted_exams', label: 'Exams accepted', kind: 'list' },
    { key: 'counseling_systems', label: 'Counselling', kind: 'list' },
    { key: 'has_management_quota', label: 'Management quota', kind: 'bool' },
    { key: 'has_nri_quota', label: 'NRI quota', kind: 'bool' },
    { key: 'admission_opens_on', label: 'Admissions open', kind: 'date' },
    { key: 'admission_closes_on', label: 'Admissions close', kind: 'date' },
    { key: 'brochure_url', label: 'Brochure', kind: 'url' },
    { key: 'scholarships_text', label: 'Scholarships', kind: 'text' },
  ],
  fees: [
    { key: 'academic_year', label: 'Academic year', kind: 'text' },
    { key: 'tuition', label: 'Tuition (per year)', kind: 'number' },
    { key: 'hostel', label: 'Hostel (per year)', kind: 'number' },
    { key: 'mess', label: 'Mess (per year)', kind: 'number' },
    { key: 'other_fees', label: 'Other fees (per year)', kind: 'number' },
    { key: 'caution_deposit', label: 'Caution deposit', kind: 'number' },
  ],
  facilities: [
    { key: 'design_studios', label: 'Design studios', kind: 'integer' },
    { key: 'has_digital_fabrication', label: 'Digital fabrication lab', kind: 'bool' },
    { key: 'has_model_making_lab', label: 'Model making lab', kind: 'bool' },
    { key: 'has_library', label: 'Library', kind: 'bool' },
    { key: 'library_books_count', label: 'Library books', kind: 'integer' },
    { key: 'has_hostel_boys', label: 'Hostel for boys', kind: 'bool' },
    { key: 'has_hostel_girls', label: 'Hostel for girls', kind: 'bool' },
    { key: 'hostel_capacity', label: 'Hostel capacity', kind: 'integer' },
    { key: 'has_mess', label: 'Mess', kind: 'bool' },
    { key: 'has_wifi', label: 'Wi-Fi', kind: 'bool' },
    { key: 'campus_area_acres', label: 'Campus area (acres)', kind: 'number' },
    { key: 'software_available', label: 'Software', kind: 'list' },
  ],
  location: [
    { key: 'address', label: 'Address', kind: 'text' },
    { key: 'pincode', label: 'PIN code', kind: 'text' },
    { key: 'latitude', label: 'Latitude', kind: 'number' },
    { key: 'longitude', label: 'Longitude', kind: 'number' },
    { key: 'nearest_railway', label: 'Nearest railway station', kind: 'text' },
    { key: 'railway_distance_km', label: 'Railway distance (km)', kind: 'number' },
    { key: 'nearest_airport', label: 'Nearest airport', kind: 'text' },
    { key: 'airport_distance_km', label: 'Airport distance (km)', kind: 'number' },
  ],
  photos: [
    { key: 'hero_image_url', label: 'Cover photo', kind: 'image' },
    { key: 'logo_url', label: 'Logo', kind: 'image' },
    { key: 'gallery_images', label: 'Gallery', kind: 'images' },
  ],
};

type Coerced = { ok: true; value: unknown } | { ok: false; error: string };

const HTTP_URL = /^https?:\/\/\S+$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function coerce(field: FieldDef, raw: unknown): Coerced {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const bad = (what: string): Coerced => ({ ok: false, error: `${field.label}: ${what}` });
  switch (field.kind) {
    case 'text': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return bad('expected text.');
      const s = String(raw).trim();
      return { ok: true, value: s || null };
    }
    case 'url':
    case 'image': {
      if (typeof raw !== 'string') return bad('expected a link.');
      const s = raw.trim();
      if (!s) return { ok: true, value: null };
      if (!HTTP_URL.test(s)) return bad('must start with http:// or https://.');
      return { ok: true, value: s };
    }
    case 'number':
    case 'integer': {
      if (raw === '') return { ok: true, value: null };
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : NaN;
      if (!Number.isFinite(n)) return bad('expected a number.');
      if (n < 0 && field.key !== 'latitude' && field.key !== 'longitude') return bad('cannot be negative.');
      return { ok: true, value: field.kind === 'integer' ? Math.round(n) : n };
    }
    case 'bool':
      if (typeof raw !== 'boolean') return bad('expected yes or no.');
      return { ok: true, value: raw };
    case 'date':
      if (typeof raw !== 'string') return bad('expected a date.');
      if (!raw.trim()) return { ok: true, value: null };
      if (!ISO_DATE.test(raw.trim()) || Number.isNaN(Date.parse(`${raw.trim()}T00:00:00Z`))) return bad('expected YYYY-MM-DD.');
      return { ok: true, value: raw.trim() };
    case 'list':
    case 'images': {
      if (!Array.isArray(raw)) return bad('expected a list.');
      const items = raw
        .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
        .map((x) => String(x).trim())
        .filter(Boolean);
      if (field.kind === 'images' && items.some((u) => !HTTP_URL.test(u))) return bad('every photo must be a web link.');
      return { ok: true, value: Array.from(new Set(items)) };
    }
    default:
      return bad('unsupported field.');
  }
}

/** The known, present, cleaned fields of a section payload. */
export function pickFields(
  section: Section,
  payload: unknown,
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'The submission is empty.' };
  const p = payload as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const field of SECTION_FIELDS[section]) {
    if (!(field.key in p)) continue;
    const c = coerce(field, p[field.key]);
    if (!c.ok) return c;
    values[field.key] = c.value;
  }
  return { ok: true, values };
}

export interface FeeRow {
  college_id: string;
  academic_year: string;
  year_number: number;
  fee_category: 'general';
  verified: true;
  verified_source: 'college';
  updated_at: string;
  [fee: string]: unknown;
}

/** What one approval writes. `colleges` always carries the approval stamps. */
export interface ApplyPlan {
  colleges: Record<string, unknown>;
  fees?: FeeRow[];
  infrastructure?: Record<string, unknown>;
}

const FEE_KEYS = ['tuition', 'hostel', 'mess', 'other_fees', 'caution_deposit'] as const;
export const FEE_YEARS = [1, 2, 3, 4, 5] as const;
const ACADEMIC_YEAR = /^\d{4}-\d{2}$/;

/** colleges.college_provided after approving `section` now. */
export function stampProvided(current: unknown, section: Section, nowIso: string): Record<string, string> {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? (current as Record<string, string>) : {};
  return { ...base, [section]: nowIso };
}

/**
 * Turns an approved submission into the writes to make.
 * `currentProvided` is the college's college_provided map before this approval.
 */
export function buildApplyPlan(
  section: Section,
  payload: unknown,
  ctx: { collegeId: string; nowIso: string; currentProvided?: unknown },
): { ok: true; plan: ApplyPlan } | { ok: false; error: string } {
  const picked = pickFields(section, payload);
  if (!picked.ok) return picked;
  const v = picked.values;
  const stamps = {
    college_provided: stampProvided(ctx.currentProvided, section, ctx.nowIso),
    last_data_update: ctx.nowIso,
    updated_at: ctx.nowIso,
  };

  switch (section) {
    case 'profile':
      return { ok: true, plan: { colleges: { ...v, ...stamps } } };

    case 'admissions': {
      const opens = v.admission_opens_on as string | null | undefined;
      const closes = v.admission_closes_on as string | null | undefined;
      if (opens && closes && closes < opens) return { ok: false, error: 'Admissions close before they open.' };
      return { ok: true, plan: { colleges: { ...v, ...stamps } } };
    }

    case 'location': {
      const lat = v.latitude as number | null | undefined;
      const lng = v.longitude as number | null | undefined;
      if (typeof lat === 'number' && (lat < -90 || lat > 90)) return { ok: false, error: 'Latitude must be between -90 and 90.' };
      if (typeof lng === 'number' && (lng < -180 || lng > 180)) return { ok: false, error: 'Longitude must be between -180 and 180.' };
      if (('latitude' in v) !== ('longitude' in v) || (lat === null) !== (lng === null)) {
        return { ok: false, error: 'Latitude and longitude must be given together.' };
      }
      return { ok: true, plan: { colleges: { ...v, ...stamps } } };
    }

    case 'photos':
      return { ok: true, plan: { colleges: { ...v, photo_status: 'manual', ...stamps } } };

    case 'fees': {
      const year = v.academic_year;
      if (typeof year !== 'string' || !ACADEMIC_YEAR.test(year)) {
        return { ok: false, error: 'Academic year must look like 2026-27.' };
      }
      const amounts: Record<string, unknown> = {};
      for (const k of FEE_KEYS) if (k in v) amounts[k] = v[k];
      const fees: FeeRow[] = FEE_YEARS.map((n) => ({
        college_id: ctx.collegeId,
        academic_year: year,
        year_number: n,
        fee_category: 'general',
        ...amounts,
        verified: true,
        verified_source: 'college',
        updated_at: ctx.nowIso,
      }));
      const colleges: Record<string, unknown> = { ...stamps };
      if (typeof v.tuition === 'number') colleges.annual_fee_approx = Math.round(v.tuition);
      return { ok: true, plan: { colleges, fees } };
    }

    case 'facilities':
      return {
        ok: true,
        plan: {
          colleges: { ...stamps },
          infrastructure: { college_id: ctx.collegeId, ...v, updated_at: ctx.nowIso },
        },
      };

    default:
      return { ok: false, error: 'Unknown section.' };
  }
}

export interface DiffRow {
  key: string;
  label: string;
  kind: FieldKind;
  before: unknown;
  after: unknown;
  changed: boolean;
}

function norm(kind: FieldKind, v: unknown): string {
  if (v === undefined || v === null || v === '') return 'null';
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x).trim()).filter(Boolean));
  if (kind === 'number' || kind === 'integer') {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  }
  if (typeof v === 'string') return JSON.stringify(v.trim());
  return JSON.stringify(v);
}

/** Field by field, before (previous) and after (payload), for the review card. Only known fields in the payload. */
export function diffSubmission(section: Section, previous: unknown, payload: unknown): DiffRow[] {
  const prev = previous && typeof previous === 'object' ? (previous as Record<string, unknown>) : {};
  const next = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return SECTION_FIELDS[section]
    .filter((f) => f.key in next)
    .map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      before: prev[f.key] ?? null,
      after: next[f.key] ?? null,
      changed: norm(f.kind, prev[f.key]) !== norm(f.kind, next[f.key]),
    }));
}

/**
 * What a college can edit from its dashboard, section by section.
 *
 * The same definitions drive the dashboard forms and the server check of what
 * is submitted. A submission waits in college_content_submissions until staff
 * approve it in Admin > College Hub > Content reviews, which writes it to the
 * live tables (apps/admin/src/lib/college-content-submissions/apply.ts holds
 * the matching payload shapes: keep the two in step).
 */
import type { CollegeContentSection } from '@/lib/college-hub/types';

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'phone'
  | 'email'
  | 'url'
  | 'int'
  | 'money'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'choices'
  | 'list'
  | 'lat'
  | 'lng'
  | 'image'
  | 'images';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  max?: number;
  options?: readonly string[];
  /** Half width on wider screens. */
  half?: boolean;
}

export interface SectionDef {
  key: CollegeContentSection;
  title: string;
  intro: string;
  fields: FieldDef[];
}

export const EXAM_OPTIONS = ['NATA', 'JEE Main Paper 2', 'KEAM', 'KCET', 'MHT-CET', 'AP EAPCET', 'TS EAMCET', 'AAT'] as const;
export const COUNSELLING_OPTIONS = ['TNEA', 'JoSAA', 'APSCHE', 'KCET', 'CENTAC'] as const;
export const SOFTWARE_OPTIONS = ['AutoCAD', 'Revit', 'SketchUp', 'Rhino', 'Lumion', 'Photoshop', '3ds Max', 'ArchiCAD'] as const;

export const SECTIONS: SectionDef[] = [
  {
    key: 'profile',
    title: 'About and contacts',
    intro: 'What students read first, and how they reach your admissions team.',
    fields: [
      { key: 'about', label: 'About your college', kind: 'longtext', max: 3000, help: 'Two or three short paragraphs: programmes, campus, what makes you different.' },
      { key: 'highlights', label: 'Highlights', kind: 'list', max: 6, help: 'Up to 6 short points, for example "COA approved since 2008".' },
      { key: 'admissions_phone', label: 'Admissions phone', kind: 'phone', half: true, help: 'Shown to students' },
      { key: 'admissions_email', label: 'Admissions email', kind: 'email', half: true, help: 'Shown to students' },
      { key: 'phone', label: 'Office phone', kind: 'phone', half: true },
      { key: 'email', label: 'Office email', kind: 'email', half: true },
      { key: 'website', label: 'Website', kind: 'url', half: true },
      { key: 'youtube_channel_url', label: 'YouTube channel', kind: 'url', half: true },
      { key: 'instagram_handle', label: 'Instagram handle', kind: 'text', max: 60, half: true, help: 'For example @yourcollege' },
    ],
  },
  {
    key: 'fees',
    title: 'Fees',
    intro: 'Students search for fees more than anything else. Give the yearly amounts for the coming batch.',
    fields: [
      { key: 'academic_year', label: 'Academic year', kind: 'text', max: 7, half: true, help: 'For example 2026-27' },
      { key: 'tuition', label: 'Tuition per year (Rs)', kind: 'money', half: true },
      { key: 'hostel', label: 'Hostel per year (Rs)', kind: 'money', half: true },
      { key: 'mess', label: 'Mess per year (Rs)', kind: 'money', half: true },
      { key: 'other_fees', label: 'Other fees per year (Rs)', kind: 'money', half: true, help: 'Exam, lab, library and similar' },
      { key: 'caution_deposit', label: 'Caution deposit, one time (Rs)', kind: 'money', half: true },
    ],
  },
  {
    key: 'admissions',
    title: 'Admissions',
    intro: 'Seats, exams, counselling and this year\'s dates.',
    fields: [
      { key: 'total_barch_seats', label: 'B.Arch seats per year', kind: 'int', half: true },
      { key: 'brochure_url', label: 'Brochure link', kind: 'url', half: true, help: 'A PDF or page on your website' },
      { key: 'admission_opens_on', label: 'Applications open', kind: 'date', half: true },
      { key: 'admission_closes_on', label: 'Applications close', kind: 'date', half: true },
      { key: 'accepted_exams', label: 'Entrance exams accepted', kind: 'choices', options: EXAM_OPTIONS },
      { key: 'counseling_systems', label: 'Counselling', kind: 'choices', options: COUNSELLING_OPTIONS },
      { key: 'has_management_quota', label: 'Management quota seats available', kind: 'bool', half: true },
      { key: 'has_nri_quota', label: 'NRI quota seats available', kind: 'bool', half: true },
      { key: 'scholarships_text', label: 'Scholarships', kind: 'longtext', max: 1000, help: 'Who qualifies and how much. Leave empty if none.' },
    ],
  },
  {
    key: 'facilities',
    title: 'Campus and facilities',
    intro: 'Hostels, studios and labs that parents ask about.',
    fields: [
      { key: 'has_hostel_boys', label: 'Hostel for boys', kind: 'bool', half: true },
      { key: 'has_hostel_girls', label: 'Hostel for girls', kind: 'bool', half: true },
      { key: 'hostel_capacity', label: 'Hostel capacity (students)', kind: 'int', half: true },
      { key: 'has_mess', label: 'Mess on campus', kind: 'bool', half: true },
      { key: 'design_studios', label: 'Design studios', kind: 'int', half: true },
      { key: 'campus_area_acres', label: 'Campus area (acres)', kind: 'decimal', half: true },
      { key: 'has_library', label: 'Library', kind: 'bool', half: true },
      { key: 'library_books_count', label: 'Library books', kind: 'int', half: true },
      { key: 'has_model_making_lab', label: 'Model making lab', kind: 'bool', half: true },
      { key: 'has_digital_fabrication', label: 'Digital fabrication (3D printer, laser cutter)', kind: 'bool', half: true },
      { key: 'has_wifi', label: 'Wi-Fi on campus', kind: 'bool', half: true },
      { key: 'software_available', label: 'Software taught', kind: 'choices', options: SOFTWARE_OPTIONS },
    ],
  },
  {
    key: 'location',
    title: 'Location and map',
    intro: 'Your address and the map pin students use for directions.',
    fields: [
      { key: 'latitude', label: 'Latitude', kind: 'lat', half: true },
      { key: 'longitude', label: 'Longitude', kind: 'lng', half: true },
      { key: 'address', label: 'Address', kind: 'longtext', max: 400 },
      { key: 'pincode', label: 'PIN code', kind: 'text', max: 6, half: true },
      { key: 'nearest_railway', label: 'Nearest railway station', kind: 'text', max: 80, half: true },
      { key: 'railway_distance_km', label: 'Distance to station (km)', kind: 'decimal', half: true },
      { key: 'nearest_airport', label: 'Nearest airport', kind: 'text', max: 80, half: true },
      { key: 'airport_distance_km', label: 'Distance to airport (km)', kind: 'decimal', half: true },
    ],
  },
  {
    key: 'photos',
    title: 'Photos',
    intro: 'A wide campus photo for the top of your page, your logo, and up to 8 more photos.',
    fields: [
      { key: 'hero_image_url', label: 'Cover photo', kind: 'image', help: 'A wide (landscape) photo of the campus' },
      { key: 'logo_url', label: 'Logo', kind: 'image', help: 'Square, on a plain background' },
      { key: 'gallery_images', label: 'More photos', kind: 'images', max: 8 },
    ],
  },
];

export const SECTION_BY_KEY: Record<CollegeContentSection, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s])
) as Record<CollegeContentSection, SectionDef>;

export function isSection(value: unknown): value is CollegeContentSection {
  return typeof value === 'string' && value in SECTION_BY_KEY;
}

// ─── Server check ────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+()\d\s-]{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^20\d{2}-\d{2}$/;

/** Only https/http links on a real host. */
function cleanUrl(v: string): string | null {
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export type CleanResult = { ok: true; payload: Record<string, unknown> } | { ok: false; errors: Record<string, string> };

/**
 * Checks one section's form values and returns the payload to store. Empty
 * strings become null (clears the value). Unknown keys are dropped. Image
 * fields only accept URLs from `allowedImagePrefix` (our own storage bucket).
 */
export function cleanSubmission(
  section: CollegeContentSection,
  input: Record<string, unknown>,
  allowedImagePrefix: string
): CleanResult {
  const def = SECTION_BY_KEY[section];
  const payload: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const f of def.fields) {
    if (!(f.key in input)) continue;
    const raw = input[f.key];
    const str = typeof raw === 'string' ? raw.trim() : raw;

    switch (f.kind) {
      case 'text':
      case 'longtext': {
        if (str === null || str === undefined || str === '') { payload[f.key] = null; break; }
        if (typeof str !== 'string') { errors[f.key] = 'Enter text'; break; }
        if (f.max && str.length > f.max) { errors[f.key] = `Keep it under ${f.max} characters`; break; }
        if (f.key === 'academic_year' && !YEAR.test(str)) { errors[f.key] = 'Use the form 2026-27'; break; }
        if (f.key === 'pincode' && !/^\d{6}$/.test(str)) { errors[f.key] = 'Enter the 6-digit PIN code'; break; }
        payload[f.key] = str;
        break;
      }
      case 'phone': {
        if (!str) { payload[f.key] = null; break; }
        if (typeof str !== 'string' || !PHONE.test(str)) { errors[f.key] = 'Enter a phone number'; break; }
        payload[f.key] = str;
        break;
      }
      case 'email': {
        if (!str) { payload[f.key] = null; break; }
        if (typeof str !== 'string' || !EMAIL.test(str)) { errors[f.key] = 'Enter an email address'; break; }
        payload[f.key] = str.toLowerCase();
        break;
      }
      case 'url': {
        if (!str) { payload[f.key] = null; break; }
        const u = typeof str === 'string' ? cleanUrl(str) : null;
        if (!u) { errors[f.key] = 'Enter a full link starting with https://'; break; }
        payload[f.key] = u;
        break;
      }
      case 'int':
      case 'money':
      case 'decimal': {
        const n = num(str);
        if (n === null) { payload[f.key] = null; break; }
        if (Number.isNaN(n) || n < 0) { errors[f.key] = 'Enter a number'; break; }
        if (f.kind === 'money' && n > 5_000_000) { errors[f.key] = 'That looks too high for one year'; break; }
        if (f.kind === 'int' && (!Number.isInteger(n) || n > 100_000)) { errors[f.key] = 'Enter a whole number'; break; }
        payload[f.key] = f.kind === 'decimal' ? Math.round(n * 100) / 100 : Math.round(n);
        break;
      }
      case 'bool':
        payload[f.key] = raw === true;
        break;
      case 'date': {
        if (!str) { payload[f.key] = null; break; }
        if (typeof str !== 'string' || !DATE.test(str) || Number.isNaN(Date.parse(str))) { errors[f.key] = 'Pick a date'; break; }
        payload[f.key] = str;
        break;
      }
      case 'choices': {
        const list = Array.isArray(raw) ? raw : [];
        payload[f.key] = list.filter((v): v is string => typeof v === 'string' && !!f.options?.includes(v));
        break;
      }
      case 'list': {
        const list = (Array.isArray(raw) ? raw : [])
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean);
        if (f.max && list.length > f.max) { errors[f.key] = `Up to ${f.max} items`; break; }
        if (list.some((v) => v.length > 120)) { errors[f.key] = 'Keep each item under 120 characters'; break; }
        payload[f.key] = list;
        break;
      }
      case 'lat':
      case 'lng': {
        const n = num(str);
        if (n === null) { payload[f.key] = null; break; }
        const lim = f.kind === 'lat' ? 90 : 180;
        if (Number.isNaN(n) || Math.abs(n) > lim) { errors[f.key] = 'Enter a valid coordinate'; break; }
        payload[f.key] = Math.round(n * 1e6) / 1e6;
        break;
      }
      case 'image': {
        if (!str) { payload[f.key] = null; break; }
        if (typeof str !== 'string' || !str.startsWith(allowedImagePrefix)) { errors[f.key] = 'Upload the photo here'; break; }
        payload[f.key] = str;
        break;
      }
      case 'images': {
        const list = (Array.isArray(raw) ? raw : []).filter((v): v is string => typeof v === 'string');
        if (list.some((v) => !v.startsWith(allowedImagePrefix))) { errors[f.key] = 'Upload the photos here'; break; }
        if (f.max && list.length > f.max) { errors[f.key] = `Up to ${f.max} photos`; break; }
        payload[f.key] = list;
        break;
      }
    }
  }

  if (section === 'fees' && payload.tuition !== undefined && payload.tuition !== null && !payload.academic_year && !errors.academic_year) {
    errors.academic_year = 'Say which academic year these fees are for';
  }
  if (section === 'location') {
    const hasLat = payload.latitude !== undefined && payload.latitude !== null;
    const hasLng = payload.longitude !== undefined && payload.longitude !== null;
    if (hasLat !== hasLng) errors[hasLat ? 'longitude' : 'latitude'] = 'Give both latitude and longitude';
  }
  if (section === 'admissions' && payload.admission_opens_on && payload.admission_closes_on && String(payload.admission_closes_on) < String(payload.admission_opens_on)) {
    errors.admission_closes_on = 'The closing date is before the opening date';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(payload).length === 0) return { ok: false, errors: { _: 'Nothing to save' } };
  return { ok: true, payload };
}

/** Fields whose value differs from the live value (the ones staff need to look at). */
export function changedKeys(payload: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : Array.isArray(v) ? JSON.stringify(v) : v);
  return Object.keys(payload).filter((k) => {
    const a = norm(payload[k]);
    const b = norm(current[k]);
    if (a === null || b === null) return a !== b;
    if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b);
    return a !== b;
  });
}

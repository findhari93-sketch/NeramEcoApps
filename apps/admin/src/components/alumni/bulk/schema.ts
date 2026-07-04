/**
 * Canonical field schema for the bulk-alumni importer. Single source of truth for
 * the column mapping, per-row validation, and the downloadable template.
 */
import Papa from 'papaparse';
import { ACADEMIC_YEAR_REGEX } from '../../crm/academic-years';
import { COURSE_OPTIONS } from '../theme';

export type FieldKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'academic_year'
  | 'course_branch'
  | 'college'
  | 'linkedin_url'
  | 'instagram_url';

export interface FieldDef {
  key: FieldKey;
  label: string;
  required?: boolean;
  width?: number;
}

/** Column order used across the grid, the template, and the failed-row export. */
export const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Full name', required: true, width: 180 },
  { key: 'email', label: 'Email', width: 200 },
  { key: 'phone', label: 'Phone', width: 130 },
  { key: 'academic_year', label: 'Batch (YYYY-YY)', width: 130 },
  { key: 'course_branch', label: 'Course / branch', width: 170 },
  { key: 'college', label: 'College', width: 220 },
  { key: 'linkedin_url', label: 'LinkedIn URL', width: 200 },
  { key: 'instagram_url', label: 'Instagram', width: 170 },
];

export const FIELD_KEYS: FieldKey[] = FIELDS.map((f) => f.key);

/**
 * Messy header text (lowercased, trimmed) mapped to a canonical field. Used to
 * auto-detect columns so a plain "Full Name" or "Batch" import maps without the
 * admin touching the mapping step.
 */
export const HEADER_ALIASES: Record<string, FieldKey> = {
  'name': 'name',
  'full name': 'name',
  'fullname': 'name',
  'student name': 'name',
  'alumnus name': 'name',
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'mobile number': 'phone',
  'contact': 'phone',
  'whatsapp': 'phone',
  'batch': 'academic_year',
  'year': 'academic_year',
  'academic year': 'academic_year',
  'academic_year': 'academic_year',
  'cohort': 'academic_year',
  'passing year': 'academic_year',
  'course': 'course_branch',
  'branch': 'course_branch',
  'course / branch': 'course_branch',
  'course branch': 'course_branch',
  'course_branch': 'course_branch',
  'program': 'course_branch',
  'degree': 'course_branch',
  'college': 'college',
  'college name': 'college',
  'institute': 'college',
  'institution': 'college',
  'university': 'college',
  'linkedin': 'linkedin_url',
  'linkedin url': 'linkedin_url',
  'linkedin_url': 'linkedin_url',
  'instagram': 'instagram_url',
  'insta': 'instagram_url',
  'instagram url': 'instagram_url',
  'instagram_url': 'instagram_url',
};

/** Best-guess canonical field for a raw CSV/Excel header, or null if unknown. */
export function guessField(header: string): FieldKey | null {
  const norm = header.trim().toLowerCase().replace(/\s+/g, ' ');
  if (HEADER_ALIASES[norm]) return HEADER_ALIASES[norm];
  const compact = norm.replace(/[^a-z]/g, '');
  for (const [alias, key] of Object.entries(HEADER_ALIASES)) {
    if (alias.replace(/[^a-z]/g, '') === compact) return key;
  }
  return null;
}

export type AlumnusDraft = Record<FieldKey, string>;

export function emptyDraft(): AlumnusDraft {
  return {
    name: '',
    email: '',
    phone: '',
    academic_year: '',
    course_branch: '',
    college: '',
    linkedin_url: '',
    instagram_url: '',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;

export interface RowValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Validate a single draft. Errors block import (fix inline first); warnings are
 * advisory and still importable. Mirrors the single-add rules in
 * AlumniManualAddDialog + createManualAlumnus.
 */
export function validateDraft(d: AlumnusDraft): RowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!d.name || !d.name.trim()) errors.push('Name is required');

  const year = (d.academic_year || '').trim();
  if (year && !ACADEMIC_YEAR_REGEX.test(year)) errors.push('Batch must be YYYY-YY (e.g. 2016-17)');

  const email = (d.email || '').trim();
  if (email && !EMAIL_RE.test(email)) warnings.push('Email looks invalid');

  const li = (d.linkedin_url || '').trim();
  if (li && !URL_RE.test(li)) warnings.push('LinkedIn should start with http');

  const ig = (d.instagram_url || '').trim();
  if (ig && !URL_RE.test(ig) && !ig.startsWith('@')) warnings.push('Instagram should be a URL or @handle');

  return { errors, warnings };
}

/** Build the POST body row for /api/crm/alumni/bulk from a draft + resolved college. */
export function draftToPayload(
  d: AlumnusDraft,
  collegeId: string | null,
): Record<string, unknown> {
  const college = (d.college || '').trim();
  return {
    name: d.name.trim(),
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    academicYear: d.academic_year.trim() || null,
    college_id: collegeId,
    college_name: collegeId ? null : college || null,
    course_branch: d.course_branch.trim() || 'Architecture (B.Arch)',
    linkedin_url: d.linkedin_url.trim() || null,
    instagram_url: d.instagram_url.trim() || null,
  };
}

/** Template CSV: headers + two sample rows. No em dashes anywhere. */
export function buildTemplateCsv(): string {
  const headers = FIELDS.map((f) => f.label);
  const samples = [
    ['Priya Ramesh', 'priya@example.com', '9876543210', '2016-17', COURSE_OPTIONS[0], 'School of Planning and Architecture, New Delhi', 'https://linkedin.com/in/priyaramesh', '@priya.arch'],
    ['Arun Kumar', '', '', '2018-19', COURSE_OPTIONS[1], 'Anna University', '', ''],
  ];
  return Papa.unparse({ fields: headers, data: samples });
}

/** Turn failed rows back into a CSV (original values + a reason column) to re-upload. */
export function buildFailedCsv(rows: { draft: AlumnusDraft; reason: string }[]): string {
  const headers = [...FIELDS.map((f) => f.label), 'Reason'];
  const data = rows.map((r) => [...FIELD_KEYS.map((k) => r.draft[k] || ''), r.reason]);
  return Papa.unparse({ fields: headers, data });
}

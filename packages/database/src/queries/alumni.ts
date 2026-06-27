// @ts-nocheck - alumni_profiles not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
/**
 * Neram Classes - Alumni directory queries (Phase 2a)
 *
 * The alumni directory keeps Neram connected to graduated students over the years.
 * Identity/batch live on `users` (is_alumni, academic_year, name, avatar). The
 * alumni-only fields (college, course, social links, bio) live in `alumni_profiles`.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { getUserJourneyDetail } from './crm';

const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

export interface AlumniProfile {
  id: string;
  user_id: string;
  college_id: string | null;
  college_name: string | null;
  course_branch: string;
  college_start_year: number | null;
  expected_graduation_year: number | null;
  college_status: 'counseling' | 'studying' | 'graduated' | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
  other_links: Record<string, string> | null;
  bio: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AlumniDirectoryEntry {
  id: string; // user id
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  alumni_since: string | null;
  submission_count: number;
  college_id: string | null;
  college_name: string | null;
  course_branch: string | null;
  college_status: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
  is_verified: boolean;
  college_start_year: number | null;
  expected_graduation_year: number | null;
}

// ============================================
// DERIVED (display-only, no stored state)
// ============================================

/** India's academic year starts in April. Returns the start-year for a date. */
function currentAcademicStartYear(now: Date = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Current year of study (1..6) from the college start year, or null if unknown /
 * not started yet. Five-year B.Arch caps at 5 but we allow 6 as a buffer.
 */
export function deriveYearOfStudy(startYear?: number | null, now: Date = new Date()): number | null {
  if (!startYear || startYear < 2000 || startYear > 2100) return null;
  const y = currentAcademicStartYear(now) - startYear + 1;
  if (y < 1) return null;
  return Math.min(y, 6);
}

/**
 * Whether an alumnus has likely finished their degree ("Graduate Architect").
 * Uses expected_graduation_year when set, else start_year + course length (5 for B.Arch).
 */
export function isGraduateArchitect(
  startYear?: number | null,
  expectedGraduationYear?: number | null,
  courseYears = 5,
  now: Date = new Date(),
): boolean {
  const yr = now.getFullYear();
  if (expectedGraduationYear) return yr > expectedGraduationYear;
  if (startYear) return yr - startYear >= courseYears;
  return false;
}

// ============================================
// DIRECTORY
// ============================================

/**
 * Browseable directory of alumni: `users` where is_alumni, enriched with their
 * alumni_profiles (college/course/social) and a drawing-submission count. The
 * profile-level filters (college, course, verified) are applied in JS since the
 * alumni population is small.
 */
export async function getAlumniDirectory(
  options: {
    search?: string;
    academicYear?: string;
    collegeId?: string;
    course?: string;
    verified?: boolean;
  } = {},
  client?: TypedSupabaseClient,
): Promise<{ alumni: AlumniDirectoryEntry[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { search, academicYear, collegeId, course, verified } = options;

  let uq = supabase
    .from('users')
    .select('id, name, email, avatar_url, academic_year, alumni_since')
    .eq('is_alumni', true);
  if (search) uq = uq.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  if (academicYear) uq = uq.eq('academic_year', academicYear);
  uq = uq
    .order('academic_year', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(5000);

  const { data: users, error } = await uq;
  if (error) throw error;
  const ids = (users || []).map((u: any) => u.id);
  if (ids.length === 0) return { alumni: [], total: 0 };

  const [{ data: profiles }, { data: activity }] = await Promise.all([
    supabase.from('alumni_profiles').select('*').in('user_id', ids),
    supabase.from('admin_student_activity').select('student_id, submission_count').in('student_id', ids),
  ]);

  const profByUser: Record<string, any> = {};
  for (const p of profiles || []) profByUser[p.user_id] = p;

  const collegeIds = [...new Set((profiles || []).map((p: any) => p.college_id).filter(Boolean))];
  const collegeById: Record<string, any> = {};
  if (collegeIds.length) {
    const { data: colleges } = await supabase
      .from('colleges')
      .select('id, name, short_name, city, state')
      .in('id', collegeIds);
    for (const c of colleges || []) collegeById[c.id] = c;
  }

  const countsById: Record<string, number> = {};
  for (const a of activity || []) countsById[a.student_id] = Number(a.submission_count) || 0;

  let entries: AlumniDirectoryEntry[] = (users || []).map((u: any) => {
    const p = profByUser[u.id];
    const college = p?.college_id ? collegeById[p.college_id] : null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatar_url: u.avatar_url,
      academic_year: u.academic_year,
      alumni_since: u.alumni_since,
      submission_count: countsById[u.id] || 0,
      college_id: p?.college_id || null,
      college_name: college?.name || college?.short_name || p?.college_name || null,
      course_branch: p?.course_branch || null,
      college_status: p?.college_status || null,
      linkedin_url: p?.linkedin_url || null,
      instagram_url: p?.instagram_url || null,
      portfolio_url: p?.portfolio_url || null,
      is_verified: p?.is_verified || false,
      college_start_year: p?.college_start_year ?? null,
      expected_graduation_year: p?.expected_graduation_year ?? null,
    };
  });

  if (collegeId) entries = entries.filter((e) => e.college_id === collegeId);
  if (course) entries = entries.filter((e) => (e.course_branch || '').toLowerCase().includes(course.toLowerCase()));
  if (verified !== undefined) entries = entries.filter((e) => e.is_verified === verified);

  return { alumni: entries, total: entries.length };
}

// ============================================
// DETAIL
// ============================================

/**
 * Full alumnus profile: the shared user-journey aggregation (profile, payments,
 * onboarding, nexus documents, history, ...) plus alumni_profiles, the linked
 * college, and a compact activity feed (recent drawings + attendance summary).
 */
export async function getAlumniProfileDetail(userId: string, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();

  const detail = await getUserJourneyDetail(userId, supabase);
  if (!detail) return null;

  const [{ data: alumniProfile }, { data: act }, { data: drawings }, { data: attendanceRows }] = await Promise.all([
    supabase.from('alumni_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('admin_student_activity').select('submission_count, last_submitted_at').eq('student_id', userId).maybeSingle(),
    supabase
      .from('drawing_submissions')
      .select('id, original_image_url, status, tutor_rating, submitted_at, reviewed_at')
      .eq('student_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(12),
    supabase.from('nexus_attendance').select('attended').eq('student_id', userId),
  ]);

  let college = null;
  if (alumniProfile?.college_id) {
    const { data: c } = await supabase
      .from('colleges')
      .select('id, name, short_name, city, state, type, nirf_rank, website, logo_url')
      .eq('id', alumniProfile.college_id)
      .maybeSingle();
    college = c || null;
  }

  const attendanceTotal = (attendanceRows || []).length;
  const attendanceAttended = (attendanceRows || []).filter((a: any) => a.attended).length;

  // Admin-uploaded documents (table may be absent on envs that haven't migrated).
  let studentDocuments: any[] = [];
  try {
    const { data: sd } = await supabase
      .from('student_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    studentDocuments = sd || [];
  } catch {
    studentDocuments = [];
  }

  return {
    ...detail,
    alumniProfile: alumniProfile || null,
    college,
    studentDocuments,
    activity: {
      submissionCount: Number(act?.submission_count || 0),
      lastSubmittedAt: act?.last_submitted_at || null,
      recentDrawings: drawings || [],
      attendance: { total: attendanceTotal, attended: attendanceAttended },
    },
  };
}

// ============================================
// MUTATIONS
// ============================================

const ALUMNI_PROFILE_FIELDS = [
  'college_id',
  'college_name',
  'course_branch',
  'college_start_year',
  'expected_graduation_year',
  'college_status',
  'linkedin_url',
  'instagram_url',
  'portfolio_url',
  'other_links',
  'bio',
  'is_verified',
];

/** Insert or update an alumnus's directory profile (1:1 with the user). */
export async function upsertAlumniProfile(
  userId: string,
  fields: Partial<AlumniProfile>,
  adminId: string,
  client?: TypedSupabaseClient,
): Promise<AlumniProfile> {
  const supabase = client || getSupabaseAdminClient();

  const update: Record<string, unknown> = {};
  for (const k of ALUMNI_PROFILE_FIELDS) {
    if (k in fields) update[k] = (fields as any)[k];
  }
  update.updated_at = new Date().toISOString();
  update.updated_by = adminId;

  const { data: existing } = await supabase
    .from('alumni_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('alumni_profiles')
      .update(update)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return data as AlumniProfile;
  }

  const { data, error } = await supabase
    .from('alumni_profiles')
    .insert({ user_id: userId, created_by: adminId, ...update })
    .select('*')
    .single();
  if (error) throw error;
  return data as AlumniProfile;
}

// ============================================
// DOCUMENTS (admin-uploaded, Supabase-backed)
// ============================================

export async function listStudentDocuments(userId: string, client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from('student_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function addStudentDocument(
  doc: {
    user_id: string;
    title?: string | null;
    category?: string | null;
    file_url: string;
    file_path?: string | null;
    file_type?: string | null;
    file_size_bytes?: number | null;
    source?: string;
    uploaded_by?: string | null;
  },
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('student_documents')
    .insert({ source: 'admin', ...doc })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// MANUAL HISTORICAL ALUMNI (pre-system)
// ============================================

/**
 * Create an alumnus who never had a system account (historical batches since
 * 2017): a `users` row with is_alumni=true and no auth ids, plus their directory
 * profile. They appear in the directory immediately.
 */
export async function createManualAlumnus(
  fields: {
    name: string;
    email?: string | null;
    phone?: string | null;
    academicYear?: string | null;
  } & Partial<AlumniProfile>,
  adminId: string,
  client?: TypedSupabaseClient,
): Promise<{ userId: string }> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { name, email, phone, academicYear } = fields;

  if (!name || !name.trim()) throw new Error('Name is required.');
  if (academicYear && !ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw new Error('academicYear must be in YYYY-YY format, e.g. 2016-17.');
  }

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      user_type: 'student',
      status: 'active',
      is_alumni: true,
      alumni_since: now,
      academic_year: academicYear || null,
      lifecycle_status: 'archived',
      archived_at: now,
      archived_by: adminId,
      archived_reason: 'Historical alumnus added manually',
    })
    .select('id')
    .single();
  if (error) throw error;

  const profileFields: Record<string, unknown> = {};
  for (const k of ALUMNI_PROFILE_FIELDS) {
    if (k in fields) profileFields[k] = (fields as any)[k];
  }
  await upsertAlumniProfile(user.id, profileFields, adminId, supabase);

  return { userId: user.id };
}

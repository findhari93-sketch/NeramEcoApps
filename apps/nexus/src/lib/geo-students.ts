/**
 * Nexus-local "active student" geographic source of truth.
 *
 * Why this lives in apps/nexus (not packages/database): Nexus only manages students
 * who currently HOLD ACCESS. The shared geographic RPCs count every student (and
 * even leads), so we build the same population here, once, and reuse it across the
 * geographic hierarchy, city-wise, and city-detail routes. Editing a shared package
 * would trigger a rebuild of all 4 apps, so we keep this scoped to Nexus.
 *
 * "Has access" is defined exactly as /api/auth/me enforces it (see that route):
 * access is granted solely by an ACTIVE enrollment in an ACTIVE classroom, and
 * graduated (alumni) students are locked out. So the population is:
 *   nexus_enrollments.is_active = true AND role = 'student'
 *   AND nexus_classrooms.is_active = true
 *   AND users.is_alumni = false
 * This gives the geographic view exact parity with the teacher students list.
 */
import { getSupabaseAdminClient } from '@neram/database';
import type { GeographicCountryNode, GeographicStateNode, GeographicCityNode } from '@neram/database';
import { pickClassroomEmail, type EmailDomainStatus } from '@/lib/classroom-email';

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India',
  AE: 'UAE',
  US: 'United States',
  GB: 'United Kingdom',
  SG: 'Singapore',
  MY: 'Malaysia',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  OM: 'Oman',
  KW: 'Kuwait',
  BH: 'Bahrain',
};

function getCountryDisplay(code: string): string {
  const upper = (code || 'IN').toUpperCase();
  return COUNTRY_NAMES[upper] || upper;
}

/** Capitalise each word so "tamil nadu" -> "Tamil Nadu" (matches the SQL INITCAP output). */
function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** A currently-accessible student with normalised location, enough for avatars + drill-down. */
export interface ActiveGeoStudent {
  id: string;
  name: string;
  email: string | null;
  email_status: EmailDomainStatus;
  phone: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  country: string; // ISO-ish code, uppercased (default 'IN')
  country_display: string;
  state: string | null; // title-cased
  district: string | null; // title-cased
  city: string; // title-cased, always present (students without a city are dropped)
  enrolled_at: string | null;
}

/**
 * Fetch the students who currently hold Nexus access, joined to their
 * lead_profiles location. Students without a city are omitted (they cannot
 * appear in the geographic view).
 */
export async function getActiveGeoStudents(): Promise<ActiveGeoStudent[]> {
  const supabase = getSupabaseAdminClient() as any;

  // 1) Active classrooms (archiving a classroom must remove its students).
  const { data: classrooms, error: classErr } = await supabase
    .from('nexus_classrooms')
    .select('id')
    .eq('is_active', true);

  if (classErr) {
    console.error('getActiveGeoStudents: classrooms query failed', classErr);
    return [];
  }
  const classroomIds = (classrooms || []).map((c: any) => c.id);
  if (classroomIds.length === 0) return [];

  // 2) Active student enrollments in those classrooms, non-alumni users only.
  const { data: enrollments, error: enrErr } = await supabase
    .from('nexus_enrollments')
    .select(
      'user_id, user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, linked_classroom_email, phone, avatar_url, ms_oid, created_at, is_alumni, user_type)',
    )
    .eq('is_active', true)
    .eq('role', 'student')
    .in('classroom_id', classroomIds)
    .eq('users.is_alumni', false)
    .eq('users.user_type', 'student');

  if (enrErr) {
    console.error('getActiveGeoStudents: enrollments query failed', enrErr);
    return [];
  }

  // Dedupe by user (a student may be enrolled in more than one active classroom).
  const byId = new Map<string, any>();
  for (const e of enrollments || []) {
    const u = e.user;
    if (u && !byId.has(u.id)) byId.set(u.id, u);
  }
  const ids = Array.from(byId.keys());
  if (ids.length === 0) return [];

  // Classroom (Teams) email per student, to prefer the @neramclasses.com identity
  // over the personal Gmail in users.email (same rule as the teacher students list).
  const { data: profileEmails } = await supabase
    .from('student_profiles')
    .select('user_id, ms_teams_email')
    .in('user_id', ids);
  const msTeamsByUser = new Map<string, string | null>(
    (profileEmails || []).map((p: any) => [p.user_id, p.ms_teams_email ?? null]),
  );

  // 3) Their geography.
  const { data: profiles, error: profErr } = await supabase
    .from('lead_profiles')
    .select('user_id, city, state, district, country')
    .in('user_id', ids)
    .not('city', 'is', null)
    .not('city', 'eq', '');

  if (profErr) {
    console.error('getActiveGeoStudents: lead_profiles query failed', profErr);
    return [];
  }

  // One location per student. Some students have duplicate lead_profiles rows
  // (occasionally with conflicting cities); keep the first with a valid city so
  // a student is counted once, in one city.
  const students: ActiveGeoStudent[] = [];
  const seen = new Set<string>();
  for (const p of profiles || []) {
    const city = titleCase(p.city);
    if (!city) continue;
    if (seen.has(p.user_id)) continue;
    const u = byId.get(p.user_id);
    if (!u) continue;
    seen.add(p.user_id);
    const country = ((p.country || 'IN').trim().toUpperCase()) || 'IN';
    const { email: classroomEmail, status: emailStatus } = pickClassroomEmail({
      ms_teams_email: msTeamsByUser.get(u.id),
      linked_classroom_email: u.linked_classroom_email,
      email: u.email,
    });
    students.push({
      id: u.id,
      name: u.name,
      email: classroomEmail ?? u.personal_email ?? u.email ?? null,
      email_status: emailStatus,
      phone: u.phone,
      avatar_url: u.avatar_url,
      ms_oid: u.ms_oid,
      country,
      country_display: getCountryDisplay(country),
      state: titleCase(p.state),
      district: titleCase(p.district),
      city,
      enrolled_at: u.created_at ?? null,
    });
  }

  return students;
}

/** Assemble active students into a Country > State > City tree (counts rolled up). */
export function buildHierarchy(students: ActiveGeoStudent[]): GeographicCountryNode[] {
  const countryMap = new Map<string, Map<string, Map<string, GeographicCityNode>>>();

  for (const s of students) {
    const country = s.country || 'IN';
    const state = s.state || 'Unknown';
    const city = s.city;

    if (!countryMap.has(country)) countryMap.set(country, new Map());
    const stateMap = countryMap.get(country)!;
    if (!stateMap.has(state)) stateMap.set(state, new Map());
    const cityMap = stateMap.get(state)!;

    const existing = cityMap.get(city);
    if (existing) {
      existing.student_count += 1;
    } else {
      cityMap.set(city, { city, student_count: 1, district: s.district });
    }
  }

  const result: GeographicCountryNode[] = [];
  for (const [country, stateMap] of countryMap) {
    const states: GeographicStateNode[] = [];
    for (const [state, cityMap] of stateMap) {
      const cities = Array.from(cityMap.values()).sort((a, b) => b.student_count - a.student_count);
      states.push({
        state,
        student_count: cities.reduce((sum, c) => sum + c.student_count, 0),
        city_count: cities.length,
        cities,
      });
    }
    states.sort((a, b) => b.student_count - a.student_count);
    result.push({
      country,
      country_display: getCountryDisplay(country),
      student_count: states.reduce((sum, s) => sum + s.student_count, 0),
      state_count: states.length,
      city_count: states.reduce((sum, s) => sum + s.city_count, 0),
      states,
    });
  }

  result.sort((a, b) => b.student_count - a.student_count);
  return result;
}

/** Case-insensitive equality helper for matching location filters. */
function eqi(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/**
 * Students in a specific city, optionally disambiguated by state/country
 * (two states can share a city name). Optional free-text search + pagination.
 */
export function filterStudentsInCity(
  students: ActiveGeoStudent[],
  opts: { city: string; state?: string | null; country?: string | null; search?: string; limit?: number; offset?: number },
): { students: ActiveGeoStudent[]; total: number } {
  const { city, state, country, search, limit = 100, offset = 0 } = opts;
  let matched = students.filter((s) => eqi(s.city, city));
  if (state) matched = matched.filter((s) => eqi(s.state, state));
  if (country) matched = matched.filter((s) => eqi(s.country, country) || eqi(s.country_display, country));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    matched = matched.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q),
    );
  }

  matched.sort((a, b) => a.name.localeCompare(b.name));
  const total = matched.length;
  return { students: matched.slice(offset, offset + limit), total };
}

/** Free-text search across the active population (name / email / phone). */
export function searchActiveStudents(
  students: ActiveGeoStudent[],
  search: string,
  opts: { limit?: number; offset?: number } = {},
): { students: ActiveGeoStudent[]; total: number } {
  const { limit = 50, offset = 0 } = opts;
  const q = search.trim().toLowerCase();
  if (!q) return { students: [], total: 0 };
  const matched = students
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return { students: matched.slice(offset, offset + limit), total: matched.length };
}

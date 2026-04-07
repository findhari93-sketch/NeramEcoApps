// @ts-nocheck - Supabase types not generated
/**
 * Geographic Student Hierarchy Queries
 *
 * Groups students by Country > State > District > City
 * for the Geographic Overview page in Nexus.
 */

import { getSupabaseAdminClient } from '../client';
import type {
  GeographicHierarchyRow,
  GeographicStudent,
  GeographicCountryNode,
  GeographicStateNode,
  GeographicCityNode,
} from '../types';

// Country code to display name mapping
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
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] || upper;
}

/**
 * Get geographic hierarchy: flat rows from DB, assembled into tree.
 */
export async function getGeographicHierarchy(): Promise<GeographicCountryNode[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc('get_geographic_student_hierarchy');

  if (error) {
    console.error('RPC get_geographic_student_hierarchy failed:', error);
    return getGeographicHierarchyFallback();
  }

  return assembleHierarchy((data || []) as GeographicHierarchyRow[]);
}

/**
 * Fallback: fetch lead_profiles and aggregate in JS.
 */
async function getGeographicHierarchyFallback(): Promise<GeographicCountryNode[]> {
  const supabase = getSupabaseAdminClient();

  const { data: profiles, error: profErr } = await supabase
    .from('lead_profiles')
    .select('city, state, district, country, user_id')
    .not('city', 'is', null)
    .not('city', 'eq', '');

  if (profErr || !profiles || profiles.length === 0) {
    console.error('Fallback geographic fetch failed:', profErr);
    return [];
  }

  const userIds = [...new Set(profiles.map((p: any) => p.user_id).filter(Boolean))];
  if (userIds.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, user_type')
    .in('id', userIds)
    .eq('user_type', 'student');

  const studentIds = new Set((users || []).map((u: any) => u.id));

  // Aggregate into flat rows
  const key = (c: string, s: string, d: string, ci: string) => `${c}|${s}|${d}|${ci}`;
  const map = new Map<string, GeographicHierarchyRow>();

  for (const p of profiles) {
    if (!studentIds.has(p.user_id)) continue;
    const city = (p.city || '').trim();
    if (!city) continue;

    const country = (p.country || 'IN').trim().toUpperCase() || 'IN';
    const state = p.state ? p.state.trim() : null;
    const district = p.district ? p.district.trim() : null;
    const normalizedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    const normalizedState = state ? state.charAt(0).toUpperCase() + state.slice(1).toLowerCase() : null;
    const normalizedDistrict = district ? district.charAt(0).toUpperCase() + district.slice(1).toLowerCase() : null;

    const k = key(country, normalizedState || '', normalizedDistrict || '', normalizedCity);
    const existing = map.get(k);
    if (existing) {
      existing.student_count++;
    } else {
      map.set(k, {
        country,
        state: normalizedState,
        district: normalizedDistrict,
        city: normalizedCity,
        student_count: 1,
      });
    }
  }

  return assembleHierarchy(Array.from(map.values()));
}

/**
 * Assemble flat rows into a country > state > city tree.
 */
function assembleHierarchy(rows: GeographicHierarchyRow[]): GeographicCountryNode[] {
  const countryMap = new Map<string, Map<string, GeographicCityNode[]>>();

  for (const row of rows) {
    const country = row.country || 'IN';
    const state = row.state || 'Unknown';

    if (!countryMap.has(country)) {
      countryMap.set(country, new Map());
    }
    const stateMap = countryMap.get(country)!;

    if (!stateMap.has(state)) {
      stateMap.set(state, []);
    }
    stateMap.get(state)!.push({
      city: row.city,
      student_count: row.student_count,
      district: row.district,
    });
  }

  const result: GeographicCountryNode[] = [];

  for (const [country, stateMap] of countryMap) {
    const states: GeographicStateNode[] = [];

    for (const [state, cities] of stateMap) {
      const sortedCities = cities.sort((a, b) => b.student_count - a.student_count);
      states.push({
        state,
        student_count: cities.reduce((sum, c) => sum + c.student_count, 0),
        city_count: cities.length,
        cities: sortedCities,
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

/**
 * Search students with full geographic location data.
 * Returns flat list with location breadcrumb.
 */
export async function searchStudentsGeographic(options: {
  search: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: GeographicStudent[]; total: number }> {
  const { search, limit = 50, offset = 0 } = options;
  const supabase = getSupabaseAdminClient();

  if (!search.trim()) return { students: [], total: 0 };

  // Search users by name/email/phone
  const { data: users, count, error: userErr } = await supabase
    .from('users')
    .select('id, name, email, phone, avatar_url, user_type, created_at', { count: 'exact' })
    .eq('user_type', 'student')
    .or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (userErr || !users || users.length === 0) {
    return { students: [], total: 0 };
  }

  // Get location data from lead_profiles
  const userIds = users.map((u: any) => u.id);
  const { data: profiles } = await supabase
    .from('lead_profiles')
    .select('user_id, city, state, district, country')
    .in('user_id', userIds);

  const profileMap = new Map<string, { city: string | null; state: string | null; district: string | null; country: string }>();
  for (const p of (profiles || [])) {
    profileMap.set(p.user_id, {
      city: p.city,
      state: p.state,
      district: p.district,
      country: p.country || 'IN',
    });
  }

  const students: GeographicStudent[] = users.map((u: any) => {
    const loc = profileMap.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      avatar_url: u.avatar_url,
      user_type: u.user_type,
      city: loc?.city || null,
      state: loc?.state || null,
      district: loc?.district || null,
      country: loc?.country || 'IN',
      course_name: null,
      enrolled_at: u.created_at,
    };
  });

  return { students, total: count || 0 };
}

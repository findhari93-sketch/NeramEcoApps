// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - City-Wise Student Queries
 *
 * Aggregates students by city using lead_profiles location data.
 * Used by Nexus admins/teachers to view students grouped by city.
 */

import { getSupabaseAdminClient } from '../client';
import type { CityStudentCount, CityStudent } from '../types';

/**
 * Get student counts grouped by city.
 * Joins users → lead_profiles to get city data.
 * Only counts users with user_type in ('student', 'lead').
 */
export async function getCityStudentCounts(): Promise<CityStudentCount[]> {
  const supabase = getSupabaseAdminClient();

  // Use RPC or raw query via supabase
  // Since Supabase JS doesn't support GROUP BY natively, we use .rpc() or a workaround
  const { data, error } = await supabase
    .rpc('get_city_student_counts');

  if (error) {
    console.error('Failed to get city student counts:', error);
    // Fallback: fetch all and aggregate in JS
    return getCityStudentCountsFallback();
  }

  return (data || []) as CityStudentCount[];
}

/**
 * Fallback: get city counts by fetching lead_profiles with city and aggregating in JS.
 */
async function getCityStudentCountsFallback(): Promise<CityStudentCount[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('lead_profiles')
    .select('city, state, user_id')
    .not('city', 'is', null)
    .not('city', 'eq', '');

  if (error) {
    console.error('Failed to get lead profiles for city counts:', error);
    return [];
  }

  // Also fetch which user_ids are students
  const userIds = [...new Set((data || []).map(d => d.user_id))];
  if (userIds.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, user_type')
    .in('id', userIds)
    .in('user_type', ['student', 'lead']);

  const studentUserIds = new Set((users || []).map(u => u.id));

  // Aggregate by city
  const cityMap = new Map<string, { count: number; state: string | null }>();
  for (const row of data || []) {
    if (!studentUserIds.has(row.user_id)) continue;
    const city = (row.city || '').trim();
    if (!city) continue;
    const normalizedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
    const existing = cityMap.get(normalizedCity);
    if (existing) {
      existing.count++;
    } else {
      cityMap.set(normalizedCity, { count: 1, state: row.state || null });
    }
  }

  return Array.from(cityMap.entries())
    .map(([city, { count, state }]) => ({
      city,
      student_count: count,
      state,
    }))
    .sort((a, b) => b.student_count - a.student_count);
}

/**
 * Get students in a specific city with optional search and pagination.
 */
export async function getStudentsByCity(options: {
  city: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: CityStudent[]; total: number }> {
  const { city, search, limit = 50, offset = 0 } = options;
  const supabase = getSupabaseAdminClient();

  // Step 1: Get user_ids from lead_profiles for this city
  let profileQuery = supabase
    .from('lead_profiles')
    .select('user_id, city, state')
    .ilike('city', city);

  const { data: profiles, error: profErr } = await profileQuery;

  if (profErr || !profiles || profiles.length === 0) {
    return { students: [], total: 0 };
  }

  const userIds = [...new Set(profiles.map(p => p.user_id))];

  // Step 2: Get users with these IDs
  let userQuery = supabase
    .from('users')
    .select('id, name, email, phone, avatar_url, user_type, created_at', { count: 'exact' })
    .in('id', userIds)
    .in('user_type', ['student', 'lead']);

  if (search) {
    userQuery = userQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  userQuery = userQuery
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data: users, count, error: userErr } = await userQuery;

  if (userErr) {
    console.error('Failed to get students by city:', userErr);
    return { students: [], total: 0 };
  }

  // Build city/state lookup from profiles
  const profileMap = new Map<string, { city: string | null; state: string | null }>();
  for (const p of profiles) {
    profileMap.set(p.user_id, { city: p.city, state: p.state });
  }

  const students: CityStudent[] = (users || []).map(u => {
    const profile = profileMap.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      avatar_url: u.avatar_url,
      user_type: u.user_type,
      city: profile?.city || null,
      state: profile?.state || null,
      course_name: null, // Could be enriched later from student_profiles
      enrolled_at: u.created_at,
    };
  });

  return { students, total: count || 0 };
}

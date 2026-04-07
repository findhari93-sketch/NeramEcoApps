// @ts-nocheck - Supabase types not generated
/**
 * Student Results Queries
 *
 * Database queries for student exam results showcase on the marketing site
 */

import { getSupabaseBrowserClient } from '../client';
import type { StudentResult, StudentResultFilters, StudentResultStats, TypedSupabaseClient } from '../types';

/**
 * Get published student results with filters and pagination
 */
export async function getStudentResults(
  filters: StudentResultFilters = {},
  client?: TypedSupabaseClient
): Promise<{ data: StudentResult[]; total: number }> {
  const supabase = client || getSupabaseBrowserClient();
  const {
    search,
    exam_type,
    year,
    college,
    score_min,
    score_max,
    featured_only,
    limit = 12,
    offset = 0,
    sort = 'newest',
  } = filters;

  let query = supabase
    .from('student_results')
    .select('*', { count: 'exact' })
    .eq('is_published', true);

  if (search) {
    query = query.ilike('student_name', `%${search}%`);
  }
  if (exam_type) {
    query = query.eq('exam_type', exam_type);
  }
  if (year) {
    query = query.eq('exam_year', year);
  }
  if (college) {
    query = query.ilike('college_name', `%${college}%`);
  }
  if (score_min !== undefined) {
    query = query.gte('score', score_min);
  }
  if (score_max !== undefined) {
    query = query.lte('score', score_max);
  }
  if (featured_only) {
    query = query.eq('is_featured', true);
  }

  // Sort
  switch (sort) {
    case 'score_desc':
      query = query.order('score', { ascending: false, nullsFirst: false });
      break;
    case 'rank_asc':
      query = query.order('rank', { ascending: true, nullsFirst: false });
      break;
    case 'name_asc':
      query = query.order('student_name', { ascending: true });
      break;
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching student results:', error);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as StudentResult[], total: count || 0 };
}

/**
 * Get a single student result by slug (published only)
 */
export async function getStudentResultBySlug(
  slug: string,
  client?: TypedSupabaseClient
): Promise<StudentResult | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('student_results')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (error || !data) {
    console.error('Error fetching student result by slug:', error);
    return null;
  }

  return data as StudentResult;
}

/**
 * Get aggregate stats for the stats bar
 */
export async function getStudentResultStats(
  client?: TypedSupabaseClient
): Promise<StudentResultStats> {
  const supabase = client || getSupabaseBrowserClient();

  // Total published count
  const { count: total } = await supabase
    .from('student_results')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true);

  // Average NATA score
  const { data: nataData } = await supabase
    .from('student_results')
    .select('score')
    .eq('is_published', true)
    .eq('exam_type', 'nata')
    .not('score', 'is', null);

  const nataScores = (nataData || []).map((r: { score: number }) => r.score).filter(Boolean);
  const avg_nata_score = nataScores.length > 0
    ? Math.round((nataScores.reduce((a: number, b: number) => a + b, 0) / nataScores.length) * 10) / 10
    : null;

  // Top rank (lowest number)
  const { data: rankData } = await supabase
    .from('student_results')
    .select('rank')
    .eq('is_published', true)
    .not('rank', 'is', null)
    .order('rank', { ascending: true })
    .limit(1);

  const top_rank = rankData?.[0]?.rank || null;

  // Distinct colleges count
  const { data: collegeData } = await supabase
    .from('student_results')
    .select('college_name')
    .eq('is_published', true)
    .not('college_name', 'is', null);

  const colleges = new Set((collegeData || []).map((r: { college_name: string }) => r.college_name));
  const colleges_count = colleges.size;

  // Count by exam type
  const by_exam_type: Record<string, number> = {};
  for (const examType of ['nata', 'jee_paper2', 'tnea', 'other']) {
    const { count: c } = await supabase
      .from('student_results')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('exam_type', examType);
    if (c && c > 0) {
      by_exam_type[examType] = c;
    }
  }

  return {
    total: total || 0,
    avg_nata_score,
    top_rank,
    colleges_count,
    by_exam_type,
  };
}

/**
 * Get available filter options (years, colleges)
 */
export async function getStudentResultFilterOptions(
  client?: TypedSupabaseClient
): Promise<{ years: number[]; colleges: string[]; exam_types: string[] }> {
  const supabase = client || getSupabaseBrowserClient();

  const { data } = await supabase
    .from('student_results')
    .select('exam_year, college_name, exam_type')
    .eq('is_published', true);

  const rows = data || [];
  const years = [...new Set(rows.map((r: { exam_year: number }) => r.exam_year))].sort((a, b) => b - a);
  const colleges = [...new Set(rows.map((r: { college_name: string | null }) => r.college_name).filter(Boolean))] as string[];
  const exam_types = [...new Set(rows.map((r: { exam_type: string }) => r.exam_type))];

  return { years, colleges: colleges.sort(), exam_types };
}

/**
 * Get featured student results (for homepage section)
 */
export async function getFeaturedStudentResults(
  limit: number = 6,
  client?: TypedSupabaseClient
): Promise<StudentResult[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('student_results')
    .select('*')
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('display_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching featured student results:', error);
    return [];
  }

  return (data || []) as StudentResult[];
}

/**
 * Get all student results (admin, includes unpublished)
 */
export async function getAllStudentResults(
  filters: StudentResultFilters = {},
  client?: TypedSupabaseClient
): Promise<{ data: StudentResult[]; total: number }> {
  const supabase = client || getSupabaseBrowserClient();
  const { search, exam_type, year, limit = 50, offset = 0 } = filters;

  let query = supabase
    .from('student_results')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.ilike('student_name', `%${search}%`);
  }
  if (exam_type) {
    query = query.eq('exam_type', exam_type);
  }
  if (year) {
    query = query.eq('exam_year', year);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching all student results:', error);
    return { data: [], total: 0 };
  }

  return { data: (data || []) as StudentResult[], total: count || 0 };
}

/**
 * Create a new student result
 */
export async function createStudentResult(
  result: Omit<StudentResult, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<StudentResult | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('student_results')
    .insert(result)
    .select()
    .single();

  if (error) {
    console.error('Error creating student result:', error);
    return null;
  }

  return data as StudentResult;
}

/**
 * Update a student result
 */
export async function updateStudentResult(
  id: string,
  updates: Partial<StudentResult>,
  client?: TypedSupabaseClient
): Promise<StudentResult | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('student_results')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating student result:', error);
    return null;
  }

  return data as StudentResult;
}

/**
 * Delete a student result
 */
export async function deleteStudentResult(
  id: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseBrowserClient();

  const { error } = await supabase
    .from('student_results')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting student result:', error);
    return false;
  }

  return true;
}

/**
 * Generate a URL-friendly slug from student name, exam type, and year
 */
export function generateStudentResultSlug(
  studentName: string,
  examType: string,
  examYear: number
): string {
  const nameSlug = studentName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `${examType}-${examYear}-${nameSlug}`;
}

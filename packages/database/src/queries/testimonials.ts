// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Testimonials Queries
 *
 * Database queries for student testimonials.
 * Admin creates/manages testimonials, marketing site displays them.
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { Testimonial, TestimonialLearningMode, ExamType } from '../types';

// ============================================
// PUBLIC QUERIES (for marketing site)
// ============================================

/**
 * Get testimonials marked for homepage display.
 */
export async function getHomepageTestimonials(
  client?: TypedSupabaseClient
): Promise<Testimonial[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('is_homepage', true)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching homepage testimonials:', error);
    return [];
  }

  return (data || []) as Testimonial[];
}

/**
 * Get filtered testimonials with pagination.
 */
export async function getTestimonials(
  options: {
    year?: number;
    city?: string;
    state?: string;
    course_name?: string;
    learning_mode?: TestimonialLearningMode;
    exam_type?: ExamType;
    is_featured?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: Testimonial[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('testimonials')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (options.year) query = query.eq('year', options.year);
  if (options.city) query = query.eq('city', options.city);
  if (options.state) query = query.eq('state', options.state);
  if (options.course_name) query = query.eq('course_name', options.course_name);
  if (options.learning_mode) query = query.eq('learning_mode', options.learning_mode);
  if (options.exam_type) query = query.eq('exam_type', options.exam_type);
  if (options.is_featured) query = query.eq('is_featured', true);
  if (options.search) query = query.ilike('student_name', `%${options.search}%`);

  query = query
    .order('year', { ascending: false })
    .order('display_order', { ascending: true });

  const limit = options.limit || 12;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching testimonials:', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as Testimonial[], count: count || 0 };
}

/**
 * Get distinct filter options for the testimonials page.
 */
export async function getTestimonialFilterOptions(
  client?: TypedSupabaseClient
): Promise<{
  years: number[];
  cities: string[];
  states: string[];
  courses: string[];
  modes: TestimonialLearningMode[];
}> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('testimonials')
    .select('year, city, state, course_name, learning_mode')
    .eq('is_active', true);

  if (error || !data) {
    console.error('Error fetching filter options:', error);
    return { years: [], cities: [], states: [], courses: [], modes: [] };
  }

  const years = [...new Set(data.map((d: { year: number }) => d.year))].sort((a, b) => b - a);
  const cities = [...new Set(data.map((d: { city: string }) => d.city))].sort();
  const states = [...new Set(data.map((d: { state: string }) => d.state))].sort();
  const courses = [...new Set(data.map((d: { course_name: string }) => d.course_name))].sort();
  const modes = [...new Set(data.map((d: { learning_mode: TestimonialLearningMode }) => d.learning_mode))].sort();

  return { years, cities, states, courses, modes };
}

/**
 * Get aggregate stats for testimonials.
 */
export async function getTestimonialStats(
  client?: TypedSupabaseClient
): Promise<{
  total: number;
  avgRating: number;
  citiesCount: number;
  featuredCount: number;
}> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error, count } = await supabase
    .from('testimonials')
    .select('rating, city, is_featured', { count: 'exact' })
    .eq('is_active', true);

  if (error || !data) {
    return { total: 0, avgRating: 0, citiesCount: 0, featuredCount: 0 };
  }

  const ratings = data.filter((d: { rating: number | null }) => d.rating != null).map((d: { rating: number | null }) => d.rating!);
  const avgRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;
  const citiesCount = new Set(data.map((d: { city: string }) => d.city)).size;
  const featuredCount = data.filter((d: { is_featured: boolean }) => d.is_featured).length;

  return {
    total: count || 0,
    avgRating: Math.round(avgRating * 10) / 10,
    citiesCount,
    featuredCount,
  };
}

// ============================================
// ADMIN QUERIES (for admin panel)
// ============================================

/**
 * Get a single testimonial by ID (admin).
 */
export async function getTestimonialById(
  id: string,
  client?: TypedSupabaseClient
): Promise<Testimonial | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching testimonial:', error);
    return null;
  }

  return data as Testimonial;
}

/**
 * List all testimonials for admin (includes inactive).
 */
export async function listTestimonialsAdmin(
  options: {
    search?: string;
    year?: number;
    city?: string;
    course_name?: string;
    learning_mode?: TestimonialLearningMode;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: Testimonial[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('testimonials')
    .select('*', { count: 'exact' });

  if (options.is_active !== undefined) query = query.eq('is_active', options.is_active);
  if (options.year) query = query.eq('year', options.year);
  if (options.city) query = query.eq('city', options.city);
  if (options.course_name) query = query.eq('course_name', options.course_name);
  if (options.learning_mode) query = query.eq('learning_mode', options.learning_mode);
  if (options.search) query = query.ilike('student_name', `%${options.search}%`);

  query = query
    .order('created_at', { ascending: false });

  const limit = options.limit || 50;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error listing testimonials:', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as Testimonial[], count: count || 0 };
}

/**
 * Create a new testimonial (admin).
 */
export async function createTestimonial(
  input: Omit<Testimonial, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<Testimonial | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('testimonials')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('Error creating testimonial:', error);
    return null;
  }

  return data as Testimonial;
}

/**
 * Update a testimonial (admin).
 */
export async function updateTestimonial(
  id: string,
  updates: Partial<Omit<Testimonial, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<Testimonial | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('testimonials')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating testimonial:', error);
    return null;
  }

  return data as Testimonial;
}

/**
 * Soft-delete a testimonial (set is_active = false).
 */
export async function deleteTestimonial(
  id: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('testimonials')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting testimonial:', error);
    return false;
  }

  return true;
}

// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Course Queries
 *
 * Database queries for courses and batches
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { Course, Batch, CourseType } from '../types';

// ============================================
// COURSE QUERIES
// ============================================

/**
 * Get course by ID
 */
export async function getCourseById(
  courseId: string,
  client?: TypedSupabaseClient
): Promise<Course | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get course by slug
 */
export async function getCourseBySlug(
  slug: string,
  client?: TypedSupabaseClient
): Promise<Course | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// ============================================
// LIST QUERIES
// ============================================

export interface ListCoursesOptions {
  isActive?: boolean;
  isFeatured?: boolean;
  courseType?: CourseType;
  limit?: number;
  offset?: number;
  orderBy?: keyof Course;
  orderDirection?: 'asc' | 'desc';
}

/**
 * List courses with filters
 */
export async function listCourses(
  options: ListCoursesOptions = {},
  client?: TypedSupabaseClient
): Promise<{ courses: Course[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  const {
    isActive,
    isFeatured,
    courseType,
    limit = 20,
    offset = 0,
    orderBy = 'display_order',
    orderDirection = 'asc',
  } = options;

  let query = supabase
    .from('courses')
    .select('*', { count: 'exact' });

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive);
  }

  if (isFeatured !== undefined) {
    query = query.eq('is_featured', isFeatured);
  }

  if (courseType) {
    query = query.eq('course_type', courseType);
  }

  query = query
    .order(orderBy, { ascending: orderDirection === 'asc' })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    courses: data || [],
    count: count || 0,
  };
}

/**
 * List active courses (shorthand)
 */
export async function listActiveCourses(
  client?: TypedSupabaseClient
): Promise<Course[]> {
  const { courses } = await listCourses({ isActive: true }, client);
  return courses;
}

/**
 * List featured courses
 */
export async function listFeaturedCourses(
  client?: TypedSupabaseClient
): Promise<Course[]> {
  const { courses } = await listCourses({ isActive: true, isFeatured: true }, client);
  return courses;
}

// ============================================
// BATCH QUERIES
// ============================================

/**
 * Get batch by ID
 */
export async function getBatchById(
  batchId: string,
  client?: TypedSupabaseClient
): Promise<Batch | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

export interface ListBatchesOptions {
  courseId?: string;
  isActive?: boolean;
  hasCapacity?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * List batches with filters
 */
export async function listBatches(
  options: ListBatchesOptions = {},
  client?: TypedSupabaseClient
): Promise<{ batches: Batch[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  const {
    courseId,
    isActive,
    hasCapacity,
    limit = 20,
    offset = 0,
  } = options;

  let query = supabase
    .from('batches')
    .select('*', { count: 'exact' });

  if (courseId) {
    query = query.eq('course_id', courseId);
  }

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive);
  }

  query = query
    .order('start_date', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  let batches = (data || []) as Batch[];

  // Filter by capacity if needed (can't do this in query easily)
  if (hasCapacity) {
    batches = batches.filter(b => (b.enrolled_count || 0) < (b.capacity || 0));
  }

  return {
    batches,
    count: count || 0,
  };
}

/**
 * List batches by course
 */
export async function listBatchesByCourse(
  courseId: string,
  options: Omit<ListBatchesOptions, 'courseId'> = {},
  client?: TypedSupabaseClient
): Promise<Batch[]> {
  const { batches } = await listBatches({ ...options, courseId }, client);
  return batches;
}

/**
 * Get available batches (active with capacity)
 */
export async function getAvailableBatches(
  courseId: string,
  client?: TypedSupabaseClient
): Promise<Batch[]> {
  const { batches } = await listBatches({
    courseId,
    isActive: true,
    hasCapacity: true
  }, client);
  return batches;
}

// ============================================
// COMPOSITE QUERIES
// ============================================

/**
 * Get course with its batches
 */
export async function getCourseWithBatches(
  courseId: string,
  client?: TypedSupabaseClient
): Promise<{ course: Course; batches: Batch[] } | null> {
  const supabase = client || getSupabaseBrowserClient();

  const course = await getCourseById(courseId, supabase);
  if (!course) return null;

  const batches = await listBatchesByCourse(courseId, { isActive: true }, supabase);

  return { course, batches };
}

/**
 * Get course by slug with batches
 */
export async function getCourseBySlugWithBatches(
  slug: string,
  client?: TypedSupabaseClient
): Promise<{ course: Course; batches: Batch[] } | null> {
  const supabase = client || getSupabaseBrowserClient();

  const course = await getCourseBySlug(slug, supabase);
  if (!course) return null;

  const batches = await listBatchesByCourse(course.id, { isActive: true }, supabase);

  return { course, batches };
}

// ============================================
// WRITE OPERATIONS (Admin only)
// ============================================

/**
 * Create a new course
 */
export async function createCourse(
  courseData: Omit<Course, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<Course> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('courses')
    .insert(courseData)
    .select()
    .single();

  if (error) throw error;
  return data as Course;
}

/**
 * Update course
 */
export async function updateCourse(
  courseId: string,
  updates: Partial<Omit<Course, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<Course> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('courses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', courseId)
    .select()
    .single();

  if (error) throw error;
  return data as Course;
}

/**
 * Create a new batch
 */
export async function createBatch(
  batchData: Omit<Batch, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<Batch> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('batches')
    .insert(batchData)
    .select()
    .single();

  if (error) throw error;
  return data as Batch;
}

/**
 * Update batch
 */
export async function updateBatch(
  batchId: string,
  updates: Partial<Omit<Batch, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<Batch> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('batches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw error;
  return data as Batch;
}

/**
 * Increment batch enrollment count
 */
export async function incrementBatchEnrollment(
  batchId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const batch = await getBatchById(batchId, supabase);
  if (!batch) throw new Error('Batch not found');

  if (batch.enrolled_count >= batch.capacity) {
    throw new Error('Batch is at full capacity');
  }

  await updateBatch(batchId, {
    enrolled_count: batch.enrolled_count + 1
  }, supabase);
}

/**
 * Decrement batch enrollment count
 */
export async function decrementBatchEnrollment(
  batchId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const batch = await getBatchById(batchId, supabase);
  if (!batch) throw new Error('Batch not found');

  if (batch.enrolled_count <= 0) {
    return; // Already at 0
  }

  await updateBatch(batchId, {
    enrolled_count: batch.enrolled_count - 1
  }, supabase);
}

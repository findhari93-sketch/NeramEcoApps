// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Careers / Job Postings Queries
 *
 * Database queries for job listings and applications.
 * Admin creates/manages postings, marketing site displays them and accepts applications.
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  JobPosting,
  JobPostingStatus,
  JobApplication,
  JobApplicationStatus,
  JobApplicationWithJob,
  EmploymentType,
  CreateJobPostingInput,
  CreateJobApplicationInput,
} from '../types';

// ============================================
// PUBLIC QUERIES (for marketing site)
// ============================================

/**
 * Get published job postings, optionally filtered by department or employment type.
 */
export async function getPublishedJobPostings(
  options: {
    department?: string;
    employment_type?: EmploymentType;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<JobPosting[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('job_postings')
    .select('*')
    .eq('status', 'published');

  if (options.department) {
    query = query.eq('department', options.department);
  }

  if (options.employment_type) {
    query = query.eq('employment_type', options.employment_type);
  }

  query = query
    .order('display_priority', { ascending: false })
    .order('published_at', { ascending: false });

  if (options.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching published job postings:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a single published job posting by slug.
 */
export async function getPublishedJobBySlug(
  slug: string,
  client?: TypedSupabaseClient
): Promise<JobPosting | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('job_postings')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) {
    console.error('Error fetching job posting by slug:', error);
    return null;
  }

  return data;
}

/**
 * Submit a job application (uses admin client since RLS blocks public inserts).
 */
export async function createJobApplication(
  input: CreateJobApplicationInput,
  client?: TypedSupabaseClient
): Promise<JobApplication> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('job_applications')
    .insert({
      ...input,
      status: 'new',
      terms_agreed_at: input.terms_agreed ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create job application: ${error.message}`);
  }
  return data as JobApplication;
}

// ============================================
// ADMIN QUERIES (all statuses, full CRUD)
// ============================================

/**
 * List all job postings (admin - includes drafts, closed, archived)
 */
export async function listJobPostings(
  options: {
    status?: JobPostingStatus;
  } = {},
  client?: TypedSupabaseClient
): Promise<JobPosting[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('job_postings')
    .select('*');

  if (options.status) {
    query = query.eq('status', options.status);
  }

  query = query
    .order('display_priority', { ascending: false })
    .order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Get a single job posting by ID (admin)
 */
export async function getJobPostingById(
  id: string,
  client?: TypedSupabaseClient
): Promise<JobPosting | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('job_postings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching job posting:', error);
    return null;
  }

  return data;
}

/**
 * Create a new job posting (admin)
 */
export async function createJobPosting(
  input: CreateJobPostingInput,
  client?: TypedSupabaseClient
): Promise<JobPosting> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('job_postings')
    .insert(input)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create job posting: ${error.message}`);
  }
  return data as JobPosting;
}

/**
 * Update a job posting (admin)
 */
export async function updateJobPosting(
  id: string,
  updates: Partial<Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<JobPosting> {
  const supabase = client || getSupabaseAdminClient();

  // Auto-set published_at when publishing
  if (updates.status === 'published' && !updates.published_at) {
    updates.published_at = new Date().toISOString();
  }

  // Auto-set closed_at when closing
  if (updates.status === 'closed' && !updates.closed_at) {
    updates.closed_at = new Date().toISOString();
  }

  const { data, error } = await (supabase as any)
    .from('job_postings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update job posting ${id}: ${error.message}`);
  }
  return data as JobPosting;
}

/**
 * Delete a job posting (admin)
 */
export async function deleteJobPosting(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('job_postings')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete job posting ${id}: ${error.message}`);
  }
}

/**
 * List job applications (admin), optionally filtered by job or status.
 * Includes job posting title for display.
 */
export async function listJobApplications(
  options: {
    job_posting_id?: string;
    status?: JobApplicationStatus;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<JobApplicationWithJob[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('job_applications')
    .select(`
      *,
      job_posting:job_postings!job_posting_id(id, title, slug, department)
    `);

  if (options.job_posting_id) {
    query = query.eq('job_posting_id', options.job_posting_id);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  query = query.order('created_at', { ascending: false });

  if (options.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as JobApplicationWithJob[];
}

/**
 * Get a single job application by ID (admin)
 */
export async function getJobApplicationById(
  id: string,
  client?: TypedSupabaseClient
): Promise<JobApplicationWithJob | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('job_applications')
    .select(`
      *,
      job_posting:job_postings!job_posting_id(id, title, slug, department)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching job application:', error);
    return null;
  }

  return data as JobApplicationWithJob;
}

/**
 * Update job application status and notes (admin)
 */
export async function updateJobApplicationStatus(
  id: string,
  status: JobApplicationStatus,
  adminNotes?: string,
  client?: TypedSupabaseClient
): Promise<JobApplication> {
  const supabase = client || getSupabaseAdminClient();

  const updates: Record<string, unknown> = { status };
  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes;
  }

  const { data, error } = await (supabase as any)
    .from('job_applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update job application ${id}: ${error.message}`);
  }
  return data as JobApplication;
}

/**
 * Get count of new (unreviewed) job applications.
 * Used for the admin sidebar badge.
 */
export async function getNewJobApplicationsCount(
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const { count, error } = await supabase
    .from('job_applications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new');

  if (error) {
    console.error('Error fetching new applications count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Course Group Links - Query Functions
 *
 * CRUD for per-course WhatsApp / Teams group links
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseGroupLinks } from '../types';

/**
 * Get group links for a specific course.
 */
export async function getCourseGroupLinks(
  courseId: string,
  supabase: SupabaseClient
): Promise<CourseGroupLinks | null> {
  const { data, error } = await supabase
    .from('course_group_links')
    .select('*')
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) throw error;
  return data as CourseGroupLinks | null;
}

/**
 * Get all course group links (admin listing).
 */
export async function getAllCourseGroupLinks(
  supabase: SupabaseClient
): Promise<CourseGroupLinks[]> {
  const { data, error } = await supabase
    .from('course_group_links')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as CourseGroupLinks[];
}

/**
 * Create or update group links for a course.
 */
export async function upsertCourseGroupLinks(
  input: {
    course_id: string;
    whatsapp_group_url?: string | null;
    teams_group_chat_url?: string | null;
    teams_group_chat_id?: string | null;
    teams_class_team_url?: string | null;
    teams_class_team_id?: string | null;
    updated_by?: string;
  },
  supabase: SupabaseClient
): Promise<CourseGroupLinks> {
  const { data, error } = await supabase
    .from('course_group_links')
    .upsert(
      {
        course_id: input.course_id,
        whatsapp_group_url: input.whatsapp_group_url ?? null,
        teams_group_chat_url: input.teams_group_chat_url ?? null,
        teams_group_chat_id: input.teams_group_chat_id ?? null,
        teams_class_team_url: input.teams_class_team_url ?? null,
        teams_class_team_id: input.teams_class_team_id ?? null,
        updated_by: input.updated_by ?? null,
      },
      { onConflict: 'course_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as CourseGroupLinks;
}

// @ts-nocheck — nexus_study_file_slides is not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusStudyFileSlides, NexusStudySlidesProblem } from '../../types';

/**
 * A chapter's PowerPoint deck, read by students as PDF pages beside the chapter.
 *
 * One row per chapter at most (file_id is UNIQUE). The row remembers which
 * SharePoint file the deck is, which version of it was converted, and where
 * that PDF sits in the study-slides bucket. Converting and serving live in
 * apps/nexus/src/lib/study-slides.ts; this file only reads and writes the row.
 */

const SLIDES = 'nexus_study_file_slides';

export async function getSlidesForFile(
  fileId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileSlides | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(SLIDES as any).select('*').eq('file_id', fileId).maybeSingle();
  if (error) throw error;
  return (data as NexusStudyFileSlides) || null;
}

export interface StudySlidesSummary {
  /** A converted PDF exists, so a student can open the Slides view. */
  servable: boolean;
  problem: NexusStudySlidesProblem | null;
}

/**
 * Which of these chapters have slides, for a whole folder in one read.
 *
 * Fails open to "no slides" rather than throwing. This runs on the folder
 * browse, the hottest path a student has, and a missing table (a migration not
 * yet applied to one environment) must cost a chip, not the whole folder.
 */
export async function getSlidesSummaryMap(
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, StudySlidesSummary>> {
  const out = new Map<string, StudySlidesSummary>();
  if (!fileIds.length) return out;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SLIDES as any)
    .select('file_id, pdf_path, problem')
    .in('file_id', fileIds);
  if (error) {
    console.warn('[study-slides] summary read failed, treating as no slides:', error.message);
    return out;
  }
  for (const row of (data || []) as { file_id: string; pdf_path: string | null; problem: NexusStudySlidesProblem | null }[]) {
    out.set(row.file_id, { servable: !!row.pdf_path, problem: row.problem ?? null });
  }
  return out;
}

export type StudySlidesWrite = Omit<NexusStudyFileSlides, 'id' | 'created_at' | 'updated_at'>;

/** Attach or replace a chapter's deck, with the conversion that was just made from it. */
export async function saveSlides(
  input: StudySlidesWrite,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileSlides> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SLIDES as any)
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'file_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFileSlides;
}

/** Record a check, a fresh conversion or a problem against a chapter's deck. */
export async function updateSlides(
  fileId: string,
  patch: Partial<Omit<StudySlidesWrite, 'file_id'>>,
  client?: TypedSupabaseClient,
): Promise<NexusStudyFileSlides> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SLIDES as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('file_id', fileId)
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyFileSlides;
}

export async function deleteSlidesForFile(fileId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(SLIDES as any).delete().eq('file_id', fileId);
  if (error) throw error;
}

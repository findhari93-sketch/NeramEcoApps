// @ts-nocheck — nexus_study_file_annotations not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusStudyAnnotationDTO, NexusStudyAnnotationKind, NexusStudyAnnotationPoint } from '../../types';

const ANNOTATIONS = 'nexus_study_file_annotations';

export interface CreateAnnotationInput {
  file_id: string;
  student_id: string;
  page_number: number;
  kind: NexusStudyAnnotationKind;
  color: string;
  stroke_width?: number | null;
  points?: NexusStudyAnnotationPoint[] | null;
  anchor_x?: number | null;
  anchor_y?: number | null;
  note_text?: string | null;
}

/** One student's annotations on one file, page order then creation order (reading order). */
export async function listAnnotationsForFileAndStudent(
  fileId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusStudyAnnotationDTO[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ANNOTATIONS as any)
    .select('*')
    .eq('file_id', fileId)
    .eq('student_id', studentId)
    .eq('is_deleted', false)
    .order('page_number', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusStudyAnnotationDTO[];
}

export async function createAnnotation(
  input: CreateAnnotationInput,
  client?: TypedSupabaseClient,
): Promise<NexusStudyAnnotationDTO> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ANNOTATIONS as any)
    .insert({
      file_id: input.file_id,
      student_id: input.student_id,
      page_number: input.page_number,
      kind: input.kind,
      color: input.color,
      stroke_width: input.stroke_width ?? null,
      points: input.points ?? null,
      anchor_x: input.anchor_x ?? null,
      anchor_y: input.anchor_y ?? null,
      note_text: input.note_text ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusStudyAnnotationDTO;
}

/**
 * Edit color/note_text. Ownership is enforced in the query itself (student_id in the
 * WHERE clause) rather than a separate fetch-then-compare, so a non-owner's request
 * simply matches no row instead of needing its own authorization branch.
 */
export async function updateAnnotation(
  id: string,
  studentId: string,
  patch: { color?: string; note_text?: string | null },
  client?: TypedSupabaseClient,
): Promise<NexusStudyAnnotationDTO | null> {
  const supabase = client || getSupabaseAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.note_text !== undefined) updates.note_text = patch.note_text;

  const { data, error } = await supabase
    .from(ANNOTATIONS as any)
    .update(updates)
    .eq('id', id)
    .eq('student_id', studentId)
    .eq('is_deleted', false)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as NexusStudyAnnotationDTO) || null;
}

/** Same ownership-in-the-query pattern as updateAnnotation. Returns false if not found/owned. */
export async function softDeleteAnnotation(
  id: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ANNOTATIONS as any)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('student_id', studentId)
    .eq('is_deleted', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Per-student annotation counts on one file, for the teacher Students-tab badge. */
export async function getAnnotationCountsForFile(
  fileId: string,
  studentIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (studentIds.length === 0) return counts;
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(ANNOTATIONS as any)
    .select('student_id')
    .eq('file_id', fileId)
    .eq('is_deleted', false)
    .in('student_id', studentIds);
  for (const id of studentIds) counts[id] = 0;
  for (const row of data || []) counts[(row as any).student_id] = (counts[(row as any).student_id] || 0) + 1;
  return counts;
}

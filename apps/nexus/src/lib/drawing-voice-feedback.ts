/**
 * Voice feedback rows and their audio, for drawing reviews.
 *
 * Service role only. The table has RLS on with no policies and the bucket is
 * private, so everything a screen sees comes through here: the row without its
 * storage internals, plus a signed URL that expires.
 *
 * The rules about what counts as a valid recording or a heard note live in
 * voice-recording.ts, which is pure and tested. This file only moves data.
 */
import { getSupabaseAdminClient } from '@neram/database';
import { VOICE_FEEDBACK_BUCKET, applyListen, type ListenReport } from './voice-recording';

/** An hour, so a student who opens the page and plays the note later still can. */
export const VOICE_READ_TTL_SECONDS = 3600;

export interface DrawingVoiceFeedbackRow {
  id: string;
  submission_id: string;
  student_id: string;
  author_id: string | null;
  audio_path: string;
  audio_mime: string;
  duration_ms: number;
  size_bytes: number;
  base_image_url: string | null;
  sketch: unknown | null;
  sent_at: string | null;
  first_played_at: string | null;
  heard_fully_at: string | null;
  max_position_ms: number;
  play_count: number;
  created_at: string;
  updated_at: string;
}

/** What a screen gets: no storage path, no author id, and a playable URL. */
export interface VoiceFeedbackView {
  id: string;
  submission_id: string;
  audio_mime: string;
  duration_ms: number;
  base_image_url: string | null;
  sketch: unknown | null;
  sent_at: string | null;
  first_played_at: string | null;
  heard_fully_at: string | null;
  max_position_ms: number;
  play_count: number;
  created_at: string;
  url: string | null;
}

const TABLE = 'drawing_voice_feedback';

function db() {
  return getSupabaseAdminClient() as any;
}

function toView(row: DrawingVoiceFeedbackRow, url: string | null): VoiceFeedbackView {
  return {
    id: row.id,
    submission_id: row.submission_id,
    audio_mime: row.audio_mime,
    duration_ms: row.duration_ms,
    base_image_url: row.base_image_url,
    sketch: row.sketch,
    sent_at: row.sent_at,
    first_played_at: row.first_played_at,
    heard_fully_at: row.heard_fully_at,
    max_position_ms: row.max_position_ms,
    play_count: row.play_count,
    created_at: row.created_at,
    url,
  };
}

export async function getVoiceFeedbackBySubmission(
  submissionId: string,
): Promise<DrawingVoiceFeedbackRow | null> {
  const { data, error } = await db().from(TABLE).select('*').eq('submission_id', submissionId).maybeSingle();
  if (error) throw error;
  return (data as DrawingVoiceFeedbackRow) ?? null;
}

export async function getVoiceFeedbackForSubmissions(
  submissionIds: string[],
  opts: { sentOnly?: boolean } = {},
): Promise<DrawingVoiceFeedbackRow[]> {
  if (!submissionIds.length) return [];
  let query = db().from(TABLE).select('*').in('submission_id', submissionIds);
  if (opts.sentOnly) query = query.not('sent_at', 'is', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data as DrawingVoiceFeedbackRow[]) || [];
}

/** Views with signed read URLs, signed in one storage call. */
export async function signVoiceFeedback(rows: DrawingVoiceFeedbackRow[]): Promise<VoiceFeedbackView[]> {
  if (!rows.length) return [];
  const { data, error } = await db()
    .storage.from(VOICE_FEEDBACK_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.audio_path),
      VOICE_READ_TTL_SECONDS,
    );
  // A signing failure costs the student the play button, never the page.
  if (error) console.error('Voice feedback signing failed:', error.message);
  const urlByPath = new Map<string, string>();
  for (const s of (data || []) as { path: string | null; signedUrl: string | null }[]) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  return rows.map((r) => toView(r, urlByPath.get(r.audio_path) ?? null));
}

export async function createVoiceUploadUrl(
  path: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await db().storage.from(VOICE_FEEDBACK_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token, signedUrl: data.signedUrl };
}

/** Signing checks the object is there, which is all the save route needs to know. */
export async function voiceObjectExists(path: string): Promise<boolean> {
  const { data, error } = await db().storage.from(VOICE_FEEDBACK_BUCKET).createSignedUrl(path, 60);
  return !error && !!data?.signedUrl;
}

async function removeVoiceFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db().storage.from(VOICE_FEEDBACK_BUCKET).remove(paths);
  // A leftover file is a smaller problem than a save that fails, so this only logs.
  if (error) console.error('Voice feedback file removal failed:', error.message);
}

/**
 * Save a recording as this attempt's draft note, replacing any earlier one.
 *
 * A replacement is a new note: it goes out again with the next Redo or Complete,
 * so `sent_at` and every receipt are reset, and the old audio file is removed.
 */
export async function saveVoiceDraft(input: {
  submissionId: string;
  studentId: string;
  authorId: string;
  path: string;
  mime: string;
  durationMs: number;
  sizeBytes: number;
  baseImageUrl: string | null;
  sketch: unknown | null;
}): Promise<DrawingVoiceFeedbackRow> {
  const previous = await getVoiceFeedbackBySubmission(input.submissionId);
  const now = new Date().toISOString();

  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      {
        submission_id: input.submissionId,
        student_id: input.studentId,
        author_id: input.authorId,
        audio_path: input.path,
        audio_mime: input.mime,
        duration_ms: input.durationMs,
        size_bytes: input.sizeBytes,
        base_image_url: input.baseImageUrl,
        sketch: input.sketch,
        sent_at: null,
        first_played_at: null,
        heard_fully_at: null,
        max_position_ms: 0,
        play_count: 0,
        updated_at: now,
      },
      { onConflict: 'submission_id' },
    )
    .select('*')
    .single();
  if (error) throw error;

  if (previous && previous.audio_path !== input.path) {
    await removeVoiceFiles([previous.audio_path]);
  }
  return data as DrawingVoiceFeedbackRow;
}

export async function deleteVoiceFeedback(submissionId: string): Promise<boolean> {
  const previous = await getVoiceFeedbackBySubmission(submissionId);
  if (!previous) return false;
  const { error } = await db().from(TABLE).delete().eq('id', previous.id);
  if (error) throw error;
  await removeVoiceFiles([previous.audio_path]);
  return true;
}

/**
 * Remove the audio behind a submission that is about to be deleted. The row goes
 * with the submission by cascade; the file would not, so it goes first.
 */
export async function removeVoiceFilesForSubmission(submissionId: string): Promise<void> {
  const previous = await getVoiceFeedbackBySubmission(submissionId).catch(() => null);
  if (previous) await removeVoiceFiles([previous.audio_path]);
}

/**
 * Deliver the draft note with a Redo or Complete. Returns the row only when THIS
 * call is the one that sent it, so the caller knows whether a new note went out.
 */
export async function markVoiceSent(submissionId: string): Promise<DrawingVoiceFeedbackRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from(TABLE)
    .update({ sent_at: now, updated_at: now })
    .eq('submission_id', submissionId)
    .is('sent_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as DrawingVoiceFeedbackRow) ?? null;
}

/** Fold a playback report into the receipt. Owner-only and sent notes only. */
export async function recordVoiceListen(
  voiceId: string,
  studentId: string,
  report: Omit<ListenReport, 'durationMs' | 'now'>,
): Promise<DrawingVoiceFeedbackRow | null> {
  const { data: row, error } = await db().from(TABLE).select('*').eq('id', voiceId).maybeSingle();
  if (error) throw error;
  const current = row as DrawingVoiceFeedbackRow | null;
  if (!current || current.student_id !== studentId || !current.sent_at) return null;

  const now = new Date().toISOString();
  const next = applyListen(current, { ...report, durationMs: current.duration_ms, now });
  const { data, error: upErr } = await db()
    .from(TABLE)
    .update({ ...next, updated_at: now })
    .eq('id', voiceId)
    .select('*')
    .single();
  if (upErr) throw upErr;
  return data as DrawingVoiceFeedbackRow;
}

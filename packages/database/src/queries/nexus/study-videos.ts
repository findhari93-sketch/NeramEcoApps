// @ts-nocheck — nexus_class_recap* tables are not in the generated Supabase
// types (see class-recaps.ts:1). Same convention here rather than regenerating
// mid-feature, which would churn every other @ts-nocheck file in this folder.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import {
  getRecapById,
  getRecapForStudent,
  markRecapCompletedIfAllPassed,
  type NexusClassRecap,
} from './class-recaps';

/**
 * Foundation chapter video tracks.
 *
 * A chapter is one nexus_study_files row. It was taught live in Tamil and in
 * English, and each recording is a TRACK: a nexus_class_recaps row whose
 * study_file_id points at the chapter instead of scheduled_class_id pointing at
 * a class. Everything a track needs (checkpoints, question draws, per-student
 * progress, the byte proxy, the AI generator) is the class-recap machinery
 * unchanged; this module is the study-file-shaped door into it.
 *
 * Two things do NOT come for free, both because a track has classroom_id NULL
 * and the recap surfaces are all scoped by classroom:
 *
 *   1. Authorisation. The recap video-embed route checks enrollment with
 *      .eq('classroom_id', …), which matches NOTHING against NULL, so it must
 *      refuse tracks outright and the track routes authorise by study-folder
 *      audience instead. A Foundation chapter is standard for every cohort;
 *      enrollment is the wrong question to ask about it.
 *   2. The review queue. listRecapsNeedingReview filters on classroom_id, so a
 *      track whose generation failed would sit at readiness='held' with nobody
 *      told. listStudyTracksNeedingReview below is what covers it.
 */

const RECAPS = 'nexus_class_recaps';
const PROGRESS = 'nexus_class_recap_progress';
const READS = 'nexus_study_file_reads';

export type TrackLanguage = 'en' | 'ta' | 'ta_en';

/** Shown in the picker when a track carries no label of its own. */
const DEFAULT_LANGUAGE_LABELS: Record<TrackLanguage, string> = {
  en: 'English',
  ta: 'தமிழ்',
  ta_en: 'Tamil + English',
};

/** English first, then Tamil. Stable so the picker does not reshuffle. */
const LANGUAGE_ORDER: TrackLanguage[] = ['en', 'ta', 'ta_en'];

export interface StudyVideoTrack {
  id: string;
  study_file_id: string;
  language: TrackLanguage;
  language_label: string;
  title: string;
  status: string;
  readiness: string;
  hold_reason: string | null;
  video_duration_seconds: number | null;
  section_count: number;
}

export interface StudyVideoState {
  tracks: (StudyVideoTrack & {
    progress_status: 'in_progress' | 'completed' | 'locked' | null;
    resume_at: number;
  })[];
  video_completed_at: string | null;
  video_language: string | null;
  test_passed_at: string | null;
  completed_at: string | null;
  /** True when the chapter has a servable track, so the test is gated behind it. */
  requires_video: boolean;
}

function labelFor(language: string, stored: string | null): string {
  return stored || DEFAULT_LANGUAGE_LABELS[language as TrackLanguage] || language;
}

function byLanguage(a: { language: string }, b: { language: string }): number {
  const ai = LANGUAGE_ORDER.indexOf(a.language as TrackLanguage);
  const bi = LANGUAGE_ORDER.indexOf(b.language as TrackLanguage);
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
}

/** A track is servable to students only when it is both published and ready. */
function isServable(row: { status: string; readiness: string | null }): boolean {
  return row.status === 'published' && (row.readiness ?? 'ready') === 'ready';
}

export class TrackLanguageTakenError extends Error {
  code = 'TRACK_LANGUAGE_TAKEN';
  constructor(language: string) {
    super(`This chapter already has a ${language} track.`);
  }
}

/**
 * Create a track. Starts as a draft with readiness 'pending': it has no
 * checkpoints yet, and publishing one with none would hand the student a video
 * with nothing to earn.
 */
export async function createStudyVideoTrack(
  input: {
    studyFileId: string;
    language: TrackLanguage;
    languageLabel?: string | null;
    title?: string | null;
    recordingUrl: string;
    transcriptUrl?: string | null;
    createdBy?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusClassRecap> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .insert({
      // Both parents deliberately absent: a track belongs to a chapter, and
      // chk_class_recaps_single_parent refuses a row that claims a class too.
      scheduled_class_id: null,
      classroom_id: null,
      study_file_id: input.studyFileId,
      language: input.language,
      language_label: input.languageLabel || DEFAULT_LANGUAGE_LABELS[input.language],
      title: input.title || `${DEFAULT_LANGUAGE_LABELS[input.language]} recording`,
      recording_url: input.recordingUrl,
      transcript_url: input.transcriptUrl ?? null,
      video_source: 'sharepoint',
      status: 'draft',
      readiness: 'pending',
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // uq_class_recaps_study_file_language. Surfaced as its own error so the
    // route can say "that language is already attached" rather than "500".
    if ((error as { code?: string }).code === '23505') {
      throw new TrackLanguageTakenError(input.language);
    }
    throw error;
  }
  return data as NexusClassRecap;
}

async function sectionCounts(
  trackIds: string[],
  supabase: TypedSupabaseClient,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!trackIds.length) return counts;
  const { data } = await supabase
    .from('nexus_class_recap_sections')
    .select('recap_id')
    .in('recap_id', trackIds)
    // Archived checkpoints are soft-deleted, not gone. Counting them would tell
    // a teacher a track is ready when its live checkpoints are all archived.
    .is('archived_at', null);
  for (const row of data || []) {
    counts.set(row.recap_id, (counts.get(row.recap_id) || 0) + 1);
  }
  return counts;
}

function toTrack(row: any, counts: Map<string, number>): StudyVideoTrack {
  return {
    id: row.id,
    study_file_id: row.study_file_id,
    language: row.language,
    language_label: labelFor(row.language, row.language_label),
    title: row.title,
    status: row.status,
    readiness: row.readiness ?? 'ready',
    hold_reason: row.hold_reason ?? null,
    video_duration_seconds: row.video_duration_seconds ?? null,
    section_count: counts.get(row.id) || 0,
  };
}

/** Staff view: every track on a chapter, drafts and held ones included. */
export async function listStudyVideoTracks(
  studyFileId: string,
  client?: TypedSupabaseClient,
): Promise<StudyVideoTrack[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select('*')
    .eq('study_file_id', studyFileId)
    .neq('status', 'archived');
  if (error) throw error;

  const rows = (data || []).sort(byLanguage);
  const counts = await sectionCounts(rows.map((r) => r.id), supabase);
  return rows.map((r) => toTrack(r, counts));
}

/**
 * The one read the student chapter view needs: which languages are on offer,
 * how far they have got in each, and where the chapter as a whole stands.
 */
export async function getStudyVideoState(
  studyFileId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<StudyVideoState> {
  const supabase = client || getSupabaseAdminClient();

  const [{ data: trackRows }, { data: read }] = await Promise.all([
    supabase.from(RECAPS).select('*').eq('study_file_id', studyFileId),
    supabase
      .from(READS)
      .select('video_completed_at, video_language, test_passed_at, completed_at')
      .eq('user_id', studentId)
      .eq('file_id', studyFileId)
      .maybeSingle(),
  ]);

  // Only servable tracks reach a student. A draft or held track is invisible,
  // which is also why it must not gate the chapter test: gating on something
  // they cannot open would trap them.
  const servable = (trackRows || []).filter(isServable).sort(byLanguage);
  const counts = await sectionCounts(servable.map((r) => r.id), supabase);

  const progressById = new Map<string, { status: string; last: number }>();
  if (servable.length) {
    const { data: progressRows } = await supabase
      .from(PROGRESS)
      .select('recap_id, status, last_video_position_seconds')
      .eq('student_id', studentId)
      .in('recap_id', servable.map((r) => r.id));
    for (const p of progressRows || []) {
      progressById.set(p.recap_id, {
        status: p.status,
        last: p.last_video_position_seconds || 0,
      });
    }
  }

  return {
    tracks: servable.map((row) => {
      const p = progressById.get(row.id);
      return {
        ...toTrack(row, counts),
        progress_status: (p?.status as StudyVideoState['tracks'][number]['progress_status']) ?? null,
        resume_at: p?.last || 0,
      };
    }),
    video_completed_at: read?.video_completed_at ?? null,
    video_language: read?.video_language ?? null,
    test_passed_at: read?.test_passed_at ?? null,
    completed_at: read?.completed_at ?? null,
    requires_video: servable.length > 0,
  };
}

/**
 * Batched form of the above for the folder grid, so browsing a chapter list is
 * one query rather than one per card.
 */
export async function getStudyVideoSummaryMap(
  fileIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, { languages: TrackLanguage[]; requires_video: boolean }>> {
  const out = new Map<string, { languages: TrackLanguage[]; requires_video: boolean }>();
  if (!fileIds.length) return out;
  const supabase = client || getSupabaseAdminClient();

  const { data } = await supabase
    .from(RECAPS)
    .select('study_file_id, language, status, readiness')
    .in('study_file_id', fileIds);

  for (const row of data || []) {
    if (!isServable(row)) continue;
    const entry = out.get(row.study_file_id) || { languages: [], requires_video: true };
    if (!entry.languages.includes(row.language)) entry.languages.push(row.language);
    out.set(row.study_file_id, entry);
  }
  for (const entry of out.values()) {
    entry.languages.sort((a, b) => byLanguage({ language: a }, { language: b }));
  }
  return out;
}

/**
 * A track for the player, with the scrub ceiling worked out server-side.
 *
 * The boundary used to be a client-side computation, which meant the one number
 * the whole gate rests on was decided in the browser. It is decided here now and
 * the client is handed the answer.
 */
export async function getStudyTrackForStudent(
  trackId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<
  | (Awaited<ReturnType<typeof getRecapForStudent>> & {
      mode: 'gated' | 'revision';
      max_scrub_seconds: number | null;
    })
  | null
> {
  const supabase = client || getSupabaseAdminClient();
  const track = await getRecapForStudent(trackId, studentId, supabase);
  // Not a track: refuse rather than serve a class recap through a route whose
  // authorisation is folder-audience rather than enrollment.
  if (!track || !track.study_file_id) return null;

  const revision = track.progress_status === 'completed';
  const nextOwed = track.sections.find((s) => !s.passed);

  return {
    ...track,
    mode: revision ? 'revision' : 'gated',
    // null means "no ceiling": either they have finished it, or it has no
    // checkpoints to earn past.
    max_scrub_seconds: revision || !nextOwed ? null : nextOwed.end_timestamp_seconds,
  };
}

/**
 * Called when a track's last checkpoint passes. Marks the video half of the
 * chapter done and reports whether that completed the chapter outright, so the
 * quiz route can tell the student what just happened.
 */
export async function markStudyVideoCompleted(
  studentId: string,
  trackId: string,
  client?: TypedSupabaseClient,
): Promise<{ video_completed: boolean; chapter_completed: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const track = await getRecapById(trackId, supabase);
  if (!track?.study_file_id) return { video_completed: false, chapter_completed: false };

  // Recheck rather than trust the caller: this decides a completion record.
  const allPassed = await markRecapCompletedIfAllPassed(studentId, trackId, supabase);
  if (!allPassed) return { video_completed: false, chapter_completed: false };

  const { data, error } = await supabase.rpc('nexus_study_mark_video_completed', {
    p_user: studentId,
    p_file: track.study_file_id,
    p_language: track.language,
  });
  if (error) throw error;

  return { video_completed: true, chapter_completed: data === true };
}

/**
 * Tracks a tutor needs to look at.
 *
 * listRecapsNeedingReview cannot see these: it filters on classroom_id, which is
 * NULL on every track, so a failed generation would be held forever in silence.
 */
export async function listStudyTracksNeedingReview(
  client?: TypedSupabaseClient,
): Promise<
  (StudyVideoTrack & { chapter_title: string | null; hold_detail: string | null })[]
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select('*, study_file:nexus_study_files(title)')
    .not('study_file_id', 'is', null)
    .in('readiness', ['held', 'failed'])
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const counts = await sectionCounts(rows.map((r) => r.id), supabase);
  return rows.map((r) => ({
    ...toTrack(r, counts),
    chapter_title: r.study_file?.title ?? null,
    hold_detail: r.hold_detail ?? null,
  }));
}

// @ts-nocheck — nexus_class_recap* tables are not in the generated Supabase
// types (see class-recaps.ts:1). Same convention here rather than regenerating
// mid-feature, which would churn every other @ts-nocheck file in this folder.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import {
  getRecapById,
  getRecapForStudent,
  markRecapCompletedIfAllPassed,
  saveRecapSections,
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

/**
 * A language code as stored on the row.
 *
 * Deliberately `string` and not a union. Which languages are OFFERED is an
 * admin-editable list in nexus_settings (see apps/nexus/src/lib/track-languages.ts),
 * so a union here would have to be edited and redeployed every time a teacher
 * wanted to add one, which is the whole thing that change was undoing. The
 * database still enforces the shape via chk_class_recaps_language.
 */
export type TrackLanguage = string;

/**
 * Fallbacks for a row written before the settings list existed, and for the
 * case where a language was later removed from the offered list while a chapter
 * still has a published recording in it. Not the source of truth: the row's own
 * `language_label` is, and the API stamps it at creation.
 */
const DEFAULT_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ta: 'தமிழ்',
  ta_en: 'Tamil + English',
};

/**
 * Fallback order when the caller does not pass one. English first, then Tamil,
 * so the picker does not reshuffle between chapters. A caller that knows the
 * admin's configured order passes it in; this package must not read app config.
 */
const LANGUAGE_ORDER: string[] = ['en', 'ta', 'ta_en'];

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
  /**
   * 'sharepoint' plays through the byte proxy; 'youtube' through the IFrame API.
   * Surfaced to the teacher because it changes what they can expect: a YouTube
   * track has no SharePoint folder to look in, so its transcript can only be
   * uploaded, never fetched.
   */
  video_source: string;
}

/**
 * A track as STAFF may see it: everything a student gets, plus the video it
 * actually points at.
 *
 * Split from StudyVideoTrack rather than added to it, and that separation is
 * load-bearing. getStudyVideoState spreads the same toTrack mapper into the
 * student chapter view, so a recording_url on the shared interface would ship a
 * raw, pre-authenticated Microsoft URL to every student, straight past the
 * grant-and-proxy path that exists precisely to stop that. Keeping the field on
 * a separate type means only the reads that opt in can carry it.
 *
 * It exists because its absence was a real usability bug: the teacher's own
 * dialog could not show which file a track pointed at, nor offer to change it,
 * so an attached recording went invisible the moment it was saved.
 */
export interface StaffStudyVideoTrack extends StudyVideoTrack {
  recording_url: string | null;
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
  /**
   * True when the chapter has a servable recording the student can actually
   * FINISH, so the test is gated behind it.
   *
   * Not "a recording exists". A recording with no checkpoints has nothing to
   * earn, and markStudyVideoCompleted only ever fires when a checkpoint quiz
   * passes, so gating on one would shut the test permanently. That is precisely
   * why a checkpoint-less track could not be published at all, and it is what
   * made an un-transcribed recording unreachable by any student.
   */
  requires_video: boolean;
}

/**
 * Can a student complete this recording, or is it only watchable?
 *
 * The whole open-recording rule, in one place, derived rather than stored: a
 * track with zero live checkpoints is OPEN. Watchable, ungated, and it does not
 * count towards finishing the chapter. Upload its transcript later and it turns
 * into a gate by itself, with nothing to migrate.
 */
export function trackGatesChapter(sectionCount: number): boolean {
  return sectionCount > 0;
}

function labelFor(language: string, stored: string | null): string {
  return stored || DEFAULT_LANGUAGE_LABELS[language] || language;
}

/**
 * Sort by the admin's configured order when one was passed, else by the
 * built-in fallback. A language in neither list sorts last rather than throwing:
 * an unrecognised code is a display problem, not a reason to fail the read.
 */
function makeByLanguage(order?: string[]) {
  const list = order?.length ? order : LANGUAGE_ORDER;
  return (a: { language: string }, b: { language: string }): number => {
    const ai = list.indexOf(a.language);
    const bi = list.indexOf(b.language);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  };
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

export interface CreateStudyVideoTrackInput {
  studyFileId: string;
  language: TrackLanguage;
  languageLabel?: string | null;
  title?: string | null;
  recordingUrl: string;
  /**
   * Which player the student gets. Passed in rather than sniffed here: the
   * YouTube id parser lives in the nexus app, and this package must not reach
   * into it. Defaults to 'sharepoint', which is what this used to hardcode.
   *
   * That hardcoding was a real bug, not a simplification. The serving side has
   * always handled YouTube (the video-embed route branches on this exact
   * column and hands back a youtube_id), so a YouTube track could be played
   * but never created.
   */
  videoSource?: 'sharepoint' | 'youtube';
  transcriptUrl?: string | null;
  createdBy?: string | null;
}

export interface CreateStudyVideoTrackResult {
  track: NexusClassRecap;
  /** True when an archived track was brought back rather than a new one made. */
  restored: boolean;
  /**
   * True when restoring wiped the old checkpoints because the recording
   * changed. The teacher has to upload a transcript again, so the UI has to say
   * so rather than leave them looking for checkpoints that were there before.
   */
  checkpointsCleared: boolean;
}

/**
 * Attach a recording for one language, or bring back the one that was removed.
 *
 * Starts as a draft with readiness 'pending': it has no checkpoints yet, and
 * publishing one with none would hand the student a video with nothing to earn.
 *
 * WHY THE LOOKUP FIRST, rather than insert-and-catch-23505.
 *
 * DELETE on a track archives it, because nexus_class_recap_attempts cascades
 * from the sections and a hard delete would destroy every student's passed
 * checkpoints. But uq_class_recaps_study_file_language does not exclude
 * archived rows, and listStudyVideoTracks hides them. So removing the English
 * recording left the slot occupied by a row nothing could see: the editor
 * showed no recordings while every attempt to add English again answered "this
 * chapter already has a en track", with no way out from any screen. A teacher
 * experimenting with the very first chapter could lock that language out of it
 * permanently within two presses.
 *
 * Reviving the row is also the better outcome on its own terms. It is the same
 * conclusion nexus_test_placements reached: deactivate-then-insert cannot work
 * against a unique slot, so revive what is already there.
 */
export async function createStudyVideoTrack(
  input: CreateStudyVideoTrackInput,
  client?: TypedSupabaseClient,
): Promise<CreateStudyVideoTrackResult> {
  const supabase = client || getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from(RECAPS)
    .select('id, status, recording_url, language_label, title')
    .eq('study_file_id', input.studyFileId)
    .eq('language', input.language)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'archived') throw new TrackLanguageTakenError(input.language);
    return reviveStudyVideoTrack(existing, input, supabase);
  }

  const { data, error } = await supabase
    .from(RECAPS)
    .insert({
      // Both parents deliberately absent: a track belongs to a chapter, and
      // chk_class_recaps_single_parent refuses a row that claims a class too.
      scheduled_class_id: null,
      classroom_id: null,
      study_file_id: input.studyFileId,
      language: input.language,
      language_label:
        input.languageLabel || DEFAULT_LANGUAGE_LABELS[input.language] || input.language,
      title:
        input.title ||
        `${input.languageLabel || DEFAULT_LANGUAGE_LABELS[input.language] || input.language} recording`,
      recording_url: input.recordingUrl,
      transcript_url: input.transcriptUrl ?? null,
      video_source: input.videoSource ?? 'sharepoint',
      status: 'draft',
      readiness: 'pending',
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // Still caught, as the backstop for two teachers pressing save at the same
    // instant. The lookup above closes the ordinary case, not the race.
    if ((error as { code?: string }).code === '23505') {
      throw new TrackLanguageTakenError(input.language);
    }
    throw error;
  }
  return { track: data as NexusClassRecap, restored: false, checkpointsCleared: false };
}

/**
 * Bring an archived track back for a newly attached recording.
 *
 * The checkpoints are the delicate part. They were cut from the OLD recording's
 * transcript, so against a different video their timestamps land mid-sentence
 * and the gate stops the student at nothing in particular. When the link
 * changes they have to go.
 *
 * When the link is the SAME, this was somebody undoing a delete, and keeping
 * the checkpoints hands them back the work rather than making them upload the
 * transcript a second time.
 */
async function reviveStudyVideoTrack(
  existing: { id: string; recording_url: string | null; language_label: string | null; title: string | null },
  input: CreateStudyVideoTrackInput,
  supabase: TypedSupabaseClient,
): Promise<CreateStudyVideoTrackResult> {
  const sameRecording = (existing.recording_url || '') === input.recordingUrl;

  if (!sameRecording) {
    // Safe on both paths: with no attempts saveRecapSections routes to
    // replaceRecapSections and deletes, with attempts it routes to
    // updateRecapSections and archives, which keeps the attempt rows.
    await saveRecapSections(existing.id, [], supabase);
  }

  const patch: Record<string, unknown> = {
    status: 'draft',
    recording_url: input.recordingUrl,
    video_source: input.videoSource ?? 'sharepoint',
    // Only overwrite what the caller actually supplied. A revive should not
    // silently rename a track the teacher had titled by hand.
    ...(input.languageLabel ? { language_label: input.languageLabel } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.transcriptUrl !== undefined ? { transcript_url: input.transcriptUrl } : {}),
  };

  if (!sameRecording) {
    patch.readiness = 'pending';
    patch.published_at = null;
    patch.generated_at = null;
  }

  const { data, error } = await supabase
    .from(RECAPS)
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw error;

  return {
    track: data as NexusClassRecap,
    restored: true,
    checkpointsCleared: !sameRecording,
  };
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
    video_source: row.video_source ?? 'sharepoint',
  };
}

/**
 * Staff view: every track on a chapter, drafts and held ones included, each
 * carrying the video it points at so the teacher's dialog can name it and offer
 * to change it. Staff-gated at the route, which is what licenses recording_url.
 */
export async function listStudyVideoTracks(
  studyFileId: string,
  client?: TypedSupabaseClient,
  /** The admin's configured language order. Falls back to en, ta, ta_en. */
  languageOrder?: string[],
): Promise<StaffStudyVideoTrack[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(RECAPS)
    .select('*')
    .eq('study_file_id', studyFileId)
    .neq('status', 'archived');
  if (error) throw error;

  const rows = (data || []).sort(makeByLanguage(languageOrder));
  const counts = await sectionCounts(rows.map((r) => r.id), supabase);
  return rows.map((r) => ({ ...toTrack(r, counts), recording_url: r.recording_url ?? null }));
}

/**
 * The one read the student chapter view needs: which languages are on offer,
 * how far they have got in each, and where the chapter as a whole stands.
 */
export async function getStudyVideoState(
  studyFileId: string,
  studentId: string,
  client?: TypedSupabaseClient,
  /** The admin's configured language order. Falls back to en, ta, ta_en. */
  languageOrder?: string[],
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
  const servable = (trackRows || []).filter(isServable).sort(makeByLanguage(languageOrder));
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
    // Only the recordings with checkpoints hold the test shut. A chapter whose
    // one recording is open behaves exactly like a chapter with no recording:
    // watchable, and completed on the test alone.
    requires_video: servable.some((row) => trackGatesChapter(counts.get(row.id) || 0)),
  };
}

/** One language a chapter is available in, ready to draw as a chip. */
export interface StudyVideoLanguage {
  code: TrackLanguage;
  /** The label stored on the track, so a language nobody offers any more still reads. */
  label: string;
  /** Finishing this one unlocks the chapter test. False for an open recording. */
  gates: boolean;
}

export interface StudyVideoSummary {
  languages: StudyVideoLanguage[];
  requires_video: boolean;
}

/**
 * Batched form of the above for the folder grid, so browsing a chapter list is
 * one query rather than one per card.
 *
 * Carries the LABEL as well as the code. A chip drawn from a bare code would
 * either need a second lookup per card or would print 'ta' at a student, and
 * the label is already on the row for exactly this reason.
 */
export async function getStudyVideoSummaryMap(
  fileIds: string[],
  client?: TypedSupabaseClient,
  /** The admin's configured language order. Falls back to en, ta, ta_en. */
  languageOrder?: string[],
): Promise<Map<string, StudyVideoSummary>> {
  const out = new Map<string, StudyVideoSummary>();
  if (!fileIds.length) return out;
  const supabase = client || getSupabaseAdminClient();

  const { data } = await supabase
    .from(RECAPS)
    .select('id, study_file_id, language, language_label, status, readiness')
    .in('study_file_id', fileIds);

  const servable = (data || []).filter(isServable);
  // One more query for the whole grid, not one per card: which of these
  // recordings has checkpoints decides whether its chapter is gated, and a card
  // that promised a gate the chapter does not have would be a lie in the
  // direction that costs a student time.
  const counts = await sectionCounts(
    servable.map((r: { id: string }) => r.id),
    supabase,
  );

  for (const row of servable) {
    const entry = out.get(row.study_file_id) || { languages: [], requires_video: false };
    const gates = trackGatesChapter(counts.get(row.id) || 0);
    if (!entry.languages.some((l) => l.code === row.language)) {
      entry.languages.push({
        code: row.language,
        label: labelFor(row.language, row.language_label),
        gates,
      });
    }
    if (gates) entry.requires_video = true;
    out.set(row.study_file_id, entry);
  }
  const cmp = makeByLanguage(languageOrder);
  for (const entry of out.values()) {
    entry.languages.sort((a, b) => cmp({ language: a.code }, { language: b.code }));
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

/**
 * Column lists shared by the two video-meta routes.
 *
 * A route.ts file may only export HTTP handlers, so the prompt route cannot
 * import these from the route next to it. Keeping one definition matters here:
 * the prompt builder reads transcript_url and teams_meeting_id off the class,
 * and if the two selects drifted, "Copy prompt" would quietly stop finding
 * transcripts on one screen but not the other.
 */

/**
 * Class columns both video-meta routes need.
 *
 * `teams_wrapup_hash` is here so the GET can tell whether the Teams card still
 * matches the class. It is the only way to notice that the nightly backup filled
 * youtube_url without anybody being able to announce it.
 */
export const VIDEO_META_CLASS_COLS =
  'id, classroom_id, teacher_id, title, description, summary_bullets, scheduled_date, youtube_url, recording_url, transcript_url, teams_meeting_id, publish_state, teams_wrapup_hash';

/** Every column of nexus_class_video_meta the panel reads and writes. */
export const VIDEO_META_COLS =
  'id, scheduled_class_id, yt_title, yt_description, yt_tags, chapters, search_terms, language, exam, difficulty, category, thumbnail_url, status, generated_at, generated_by, created_at, updated_at';

/** The class shape both routes work with. */
export interface VideoMetaClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string | null;
  description: string | null;
  summary_bullets: unknown;
  scheduled_date: string | null;
  youtube_url: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  teams_meeting_id: string | null;
  publish_state: string | null;
  teams_wrapup_hash: string | null;
}

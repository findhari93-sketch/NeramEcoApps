/**
 * Which nexus_scheduled_classes columns a timetable LIST read ships.
 *
 * The week/month read (/api/timetable GET) and the student's merged schedule
 * (/api/timetable/my-schedule) are the most requested responses in Nexus, and
 * both used `*`. That carried every bookkeeping column the Teams and sync jobs
 * keep for themselves (message ids for edits and deletes, a wrap-up hash, the
 * attendance sync log), none of which any calendar, card or class panel reads.
 *
 * The list below is every column EXCEPT those, so anything a client reads today
 * keeps arriving. It is deliberately an allow-list of what to keep rather than a
 * guess at what is used: a column added later is missing until it is added
 * here, which is why the read falls back to `*` on an unknown-column error
 * (an environment behind on migrations) instead of failing the timetable.
 *
 * Writes (POST/PATCH in /api/timetable) still select `*`: their callers go on
 * to edit Teams posts and need exactly the message ids dropped here.
 */

/** Server-only bookkeeping; no timetable client reads any of these. */
export const SCHEDULED_CLASS_LIST_EXCLUDED = [
  'attendance_sync_detail',
  'attendance_sync_attempts',
  'teams_channel_message_id',
  'teams_group_chat_message_id',
  'teams_wrapup_message_id',
  'teams_wrapup_chat_message_id',
  'teams_wrapup_hash',
  'teams_share_message_id',
  'teams_share_chat_message_id',
  'teams_share_posted_by',
  'online_meeting_id',
  'content_edited_by',
] as const;

export const SCHEDULED_CLASS_LIST_COLUMNS = [
  'id',
  'classroom_id',
  'topic_id',
  'teacher_id',
  'title',
  'description',
  'scheduled_date',
  'start_time',
  'end_time',
  'teams_meeting_url',
  'teams_meeting_id',
  'recording_url',
  'recording_duration_minutes',
  'status',
  'rescheduled_to',
  'notes',
  'created_at',
  'updated_at',
  'batch_id',
  'teams_meeting_join_url',
  'transcript_url',
  'recording_fetched_at',
  'teams_meeting_scope',
  'target_scope',
  'organizer_name',
  'recurrence_rule',
  'recurrence_group_id',
  'lobby_bypass',
  'allowed_presenters',
  'plan_entry_id',
  'course_topic_id',
  'youtube_url',
  'publish_state',
  'published_at',
  'auto_sync_recording',
  'summary_bullets',
  'library_video_id',
  'attendance_synced_at',
  'teams_channel_id',
  'meeting_group_id',
  'organizer_email',
  'organizer_ms_oid',
  'attendance_sync_status',
  'teams_calendar_event_id',
  'teams_meeting_degraded',
  'cover_image_id',
  'teams_organizer_event_id',
  'content_edited_at',
  'teams_wrapup_posted_at',
  'teams_share_posted_at',
  'recording_sync_attempts',
  'recording_sync_status',
  'recording_sync_detail',
  'kind',
].join(', ');

/**
 * True for PostgREST's "that column does not exist" answers: 42703 from
 * Postgres, PGRST204 from the schema cache. Seen when an environment has not
 * run a migration yet (staging drift).
 */
export function isUnknownColumnError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42703' || code === 'PGRST204';
}

/**
 * Run a read with the narrow column list, and once more with the wide one if
 * the narrow one names a column this database does not have. A narrower
 * payload is an optimisation; it must never be the reason a timetable is empty.
 */
export async function selectWithColumnFallback<R extends { error: unknown }>(
  run: (columns: string) => PromiseLike<R>,
  narrow: string,
  wide: string,
  label: string,
): Promise<R> {
  const first = await run(narrow);
  if (!isUnknownColumnError(first.error)) return first;
  console.warn(`[${label}] narrow column list rejected, retrying with *:`, (first.error as { message?: string })?.message);
  return run(wide);
}

/**
 * Telling a taught class apart from a scheduled exam.
 *
 * nexus_scheduled_classes gained a `kind` column when exams landed. Every row
 * that existed before is 'lecture', and the column defaults to it, so nothing
 * broke on the day. But every reader of that table now sees exam rows too, and
 * each one has to mean what it says.
 *
 * THE AUDIT, done once so it does not have to be redone from scratch:
 *
 *   NATURALLY SAFE, no change needed. These already filter on something an exam
 *   never has, so an exam row cannot reach them:
 *     - api/cron/sync-attendance     .not('teams_meeting_id', 'is', null)
 *     - api/cron/youtube-backup      requires recording_url
 *     - api/class-recaps/candidates  .not('recording_url', 'is', null)
 *     - lib/recap-autodraft          .or(recording_url / youtube_url not null)
 *     - api/timetable/sync-now       .not('teams_meeting_join_url', 'is', null)
 *     - lib/transcript-sync, lib/recording-backfill, lib/youtube-backup-sync
 *     - lib/teams-meeting-sync       keyed on a meeting that does not exist
 *
 *   PATCHED, because it selects on date and status alone and would otherwise
 *   chase a teacher for the wrap-up of a paper:
 *     - api/cron/class-followups     .eq('kind', CLASS_KIND_LECTURE)
 *
 *   DELIBERATELY UNFILTERED, an exam SHOULD appear:
 *     - api/timetable (the calendar itself), my-schedule, the student and
 *       teacher dashboards. Showing the exam next to the day's classes is the
 *       entire reason it is a timetable row. The class panel decides what to
 *       render from `kind`, rather than the query hiding it.
 *
 *   NOT REACHABLE. These are keyed on a class that has a prep test, a recap, a
 *   recording or an absence row, none of which an exam produces:
 *     - class-prep.ts, class-recaps.ts, catchup-journey.ts, catchup-test.ts
 */

/** The class kinds. */
export const CLASS_KIND_LECTURE = 'lecture';
export const CLASS_KIND_EXAM = 'exam';

export type ClassKind = typeof CLASS_KIND_LECTURE | typeof CLASS_KIND_EXAM;

/**
 * Is this row a taught class rather than a scheduled exam?
 *
 * Null-safe on purpose: `kind` is NOT NULL with a default, but a partial select
 * that did not ask for the column would otherwise read as "not a lecture" and
 * silently drop every class.
 */
export function isLecture(row: { kind?: string | null } | null | undefined): boolean {
  return !row || !row.kind || row.kind === CLASS_KIND_LECTURE;
}

export function isExam(row: { kind?: string | null } | null | undefined): boolean {
  return row?.kind === CLASS_KIND_EXAM;
}

/**
 * Record that a class does not need the nightly YouTube backup, because a human
 * already put the recording on the channel.
 *
 * The database was built for this on day one: nexus_class_video_uploads.status
 * has always allowed 'skipped', the candidate filter in youtube-backup-sync has
 * always honoured it, and the column comment says in as many words "skipped when
 * a human already supplied a youtube_url". Nothing ever wrote it. This is that
 * missing half.
 *
 * Strictly speaking the skip row is not what stops a re-upload: the candidate
 * query filters on `youtube_url IS NULL`, so pasting the link is already enough.
 * The row is what makes the intent legible afterwards. Without it, "a human
 * handled this in July" and "the cron has never reached this one" look identical
 * in the backlog, and the difference is the whole question an operator is asking.
 */

/** What happened, so the caller can tell the teacher the truth. */
export type SkipOutcome =
  /** A skip row was written. The normal case. */
  | 'skipped'
  /** The automation already finished this class. Its record is worth more. */
  | 'kept'
  /** A part-paid resumable session was thrown away to avoid a duplicate video. */
  | 'abandoned';

export async function markBackupSkipped(
  supabase: any,
  classId: string,
  detail = 'A human uploaded this recording and supplied the link.',
): Promise<SkipOutcome> {
  const { data: prior } = await supabase
    .from('nexus_class_video_uploads')
    .select('status, upload_session_uri, youtube_video_id')
    .eq('class_id', classId)
    .maybeSingle();

  // Never overwrite a terminal row. 'ok' carries the video id the promotion pass
  // needs to read the live privacy status, and losing it would strand the video
  // as private forever. 'unavailable' is a decision already made.
  if (prior?.status === 'ok' || prior?.status === 'unavailable') return 'kept';
  if (prior?.status === 'skipped') return 'skipped';

  // A live session means 1600 quota units are already spent on an upload that is
  // part done. Letting it finish is the worse option, not the kinder one: it
  // would put a second copy of this class on the channel next to the one the
  // human uploaded. So it is abandoned deliberately, and the caller says so out
  // loud rather than swallowing it.
  const abandoning = prior?.status === 'uploading' && Boolean(prior?.upload_session_uri);

  const { error } = await supabase.from('nexus_class_video_uploads').upsert(
    {
      class_id: classId,
      status: 'skipped',
      detail: detail.slice(0, 400),
      // Clear the session so no later run tries to resume what we just gave up on.
      upload_session_uri: null,
      session_started_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'class_id' },
  );
  if (error) throw error;

  return abandoning ? 'abandoned' : 'skipped';
}

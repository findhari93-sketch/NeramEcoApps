import { NextRequest, NextResponse } from 'next/server';
import { requireYouTubeAdmin } from '@/lib/youtube-oauth-guard';
import { backupBlockedReason, type BackupBlock } from '@/lib/youtube-backup-sync';

export const dynamic = 'force-dynamic';

/**
 * Every recorded class and where its backup stands.
 *
 * The dry run answers "how many are queued". This answers the question that
 * immediately follows, "which ones, and what is wrong with the rest", which
 * until now could only be reached by opening classes one at a time in the
 * timetable drawer and reading four separate sections.
 *
 * Read-only and quota-free, so it loads on mount rather than behind a button.
 *
 * Deliberately NOT built on /api/timetable/recordings, which looks close enough
 * to reuse. That route scopes its results by nexus_enrollments and returns an
 * empty list for a user with none, while this screen is gated on the
 * `system.settings` capability. The two populations are different on purpose,
 * and an ops admin would have been shown an empty table and believed it.
 *
 * `force-dynamic` is correct here despite the repo's caching rules: the whole
 * value is that it reflects the last cron run, and it is one low-traffic admin
 * screen behind a capability gate.
 */

/**
 * The sweep's own vocabulary plus one reason it never produces.
 *
 * A cancelled or draft class is excluded by the candidate QUERY rather than by
 * the predicate, so `backupBlockedReason` has no word for it. The backlog shows
 * every recorded class, including those, and "not published" is a different
 * problem from "a human did it" even though both mean "not queued".
 */
type BacklogBlock = BackupBlock | 'not_published';

interface BacklogRow {
  id: string;
  scheduled_date: string;
  start_time: string | null;
  title: string | null;
  youtube_url: string | null;
  publish_state: string | null;
  status: string | null;
  /** Why the sweep will not pick this up, or null when it is queued. */
  blocked: BacklogBlock | null;
  transcript: { status: string; segments: number } | null;
  listing: { status: string; yt_title: string | null } | null;
  upload: {
    status: string;
    attempts: number;
    detail: string | null;
    bytes_uploaded: number | null;
    file_size: number | null;
    youtube_video_id: string | null;
    privacy_status: string | null;
    uploaded_at: string | null;
    /** Where to go and flip the privacy, the same link the class panel builds. */
    studio_url: string | null;
  } | null;
}

export async function GET(request: NextRequest) {
  const admin = await requireYouTubeAdmin(request.headers.get('Authorization'));
  if (admin instanceof NextResponse) return admin;

  const supabase = admin.supabase as any;

  try {
    // Everything ever recorded, not just what is due. A class that finished
    // months ago and is already on the channel is exactly what someone comes
    // here to confirm.
    const { data: classes, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, scheduled_date, start_time, end_time, title, youtube_url, publish_state, status')
      .not('recording_url', 'is', null)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = (classes || []) as any[];
    if (!rows.length) return NextResponse.json({ classes: [] });

    const ids = rows.map((r) => r.id);

    // Three small reads rather than one join: PostgREST cannot join these, and
    // at the size of this table the round trips are cheaper than the complexity.
    const [uploads, metas, transcripts] = await Promise.all([
      supabase
        .from('nexus_class_video_uploads')
        .select('class_id, status, attempts, detail, bytes_uploaded, file_size, youtube_video_id, privacy_status, uploaded_at')
        .in('class_id', ids),
      supabase
        .from('nexus_class_video_meta')
        .select('scheduled_class_id, status, yt_title')
        .in('scheduled_class_id', ids),
      supabase
        .from('nexus_class_transcripts')
        .select('class_id, status, segments')
        .in('class_id', ids),
    ]);

    const uploadBy = new Map<string, any>((uploads.data || []).map((r: any) => [r.class_id, r]));
    const metaBy = new Map<string, any>((metas.data || []).map((r: any) => [r.scheduled_class_id, r]));
    const transcriptBy = new Map<string, any>((transcripts.data || []).map((r: any) => [r.class_id, r]));

    const now = Date.now();
    const out: BacklogRow[] = rows.map((cls) => {
      const upload = uploadBy.get(cls.id);
      const meta = metaBy.get(cls.id);
      const transcript = transcriptBy.get(cls.id);

      // A class that already has a link is never a candidate: that is the
      // filter the sweep's own query applies before this predicate ever runs,
      // so it has to be applied here too or the two would disagree.
      const blocked: BacklogBlock | null = cls.youtube_url
        ? 'done'
        : cls.status === 'cancelled' || cls.publish_state !== 'published'
          ? 'not_published'
          : backupBlockedReason(cls, upload, undefined, now);

      return {
        id: cls.id,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        title: cls.title,
        youtube_url: cls.youtube_url,
        publish_state: cls.publish_state,
        status: cls.status,
        blocked,
        transcript: transcript
          ? { status: transcript.status, segments: transcript.segments ?? 0 }
          : null,
        listing: meta ? { status: meta.status, yt_title: meta.yt_title } : null,
        upload: upload
          ? {
              status: upload.status,
              attempts: upload.attempts ?? 0,
              detail: upload.detail,
              bytes_uploaded: upload.bytes_uploaded,
              file_size: upload.file_size,
              youtube_video_id: upload.youtube_video_id,
              privacy_status: upload.privacy_status,
              uploaded_at: upload.uploaded_at,
              studio_url: upload.youtube_video_id
                ? `https://studio.youtube.com/video/${upload.youtube_video_id}/edit`
                : null,
            }
          : null,
      };
    });

    return NextResponse.json({
      classes: out,
      queued: out.filter((r) => r.blocked === null).length,
      // Uploaded but still private, so the promotion pass cannot fill the link
      // yet. This is the number that tells an admin they have Studio work to do.
      awaitingPrivacyFlip: out.filter(
        (r) => r.upload?.status === 'ok' && r.upload.privacy_status === 'private' && !r.youtube_url,
      ).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read the backlog';
    console.error('[admin/youtube-backup/backlog]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

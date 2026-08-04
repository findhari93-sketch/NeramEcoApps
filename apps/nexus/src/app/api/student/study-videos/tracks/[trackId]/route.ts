import { NextRequest, NextResponse } from 'next/server';
import { getStudyTrackForStudent, upsertRecapProgress } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeTrack, assertServable, trackErrorResponse } from '@/lib/study-video-access';

/**
 * GET /api/student/study-videos/tracks/[trackId]
 *
 * One language track: its checkpoints, which are passed, which are locked, and
 * the two numbers the player needs.
 *
 * `max_scrub_seconds` is computed here rather than in the browser. The boundary
 * is the one value the whole anti-skip gate rests on, and until now every player
 * worked it out client-side from the section list. Sending it means the client
 * can stay dumb, and a client that lies about it is arguing with the server
 * rather than with itself.
 */
export async function GET(request: NextRequest, { params }: { params: { trackId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    await assertCanSeeTrack(user, params.trackId);

    const track = await getStudyTrackForStudent(params.trackId, user.id);
    if (!track) return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    assertServable(track);

    // First open starts the clock. Deliberately does not clobber a completed
    // status: reopening a finished track for revision must not un-finish it.
    if (track.progress_status == null) {
      await upsertRecapProgress(user.id, params.trackId, { status: 'in_progress' });
    }

    return NextResponse.json({
      track: {
        id: track.id,
        study_file_id: track.study_file_id,
        language: track.language,
        language_label: track.language_label,
        title: track.title,
        video_duration_seconds: track.video_duration_seconds,
      },
      sections: track.sections.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        start_timestamp_seconds: s.start_timestamp_seconds,
        end_timestamp_seconds: s.end_timestamp_seconds,
        question_count: s.question_count,
        passed: s.passed,
        locked: s.locked,
      })),
      mode: track.mode,
      max_scrub_seconds: track.max_scrub_seconds,
      progress_status: track.progress_status,
    });
  } catch (err) {
    const { error, status } = trackErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}

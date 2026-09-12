import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { videoRefFromBody } from '@/lib/track-recording';
import {
  recordingPolicyProblem,
  resolveVideoItemCached,
  sameRecording,
  videoItemDto,
  videoItemMessage,
  VideoItemError,
  type RecordingFingerprint,
  type ResolvedVideoItem,
} from '@/lib/sharepoint-video';

/**
 * POST /api/study-materials/files/[id]/video-tracks/resolve-link   (staff)
 * Body: { drive_id, item_id } | { url }, plus { language } to compare with the
 * recording already in that language.
 *
 * "Use this video?", before anything is saved. The picker or the paste box hands
 * over what the teacher chose; this answers with the real file (name, length,
 * folder) so they can recognise it, refuses what the library policy does not
 * allow, and says whether it is the recording already attached, moved. That
 * last part is what lets a teacher who moves a video into the library keep the
 * checkpoints cut from it.
 *
 *   200 { item, same_as: { track_id, verdict, checkpoint_count, previous_duration_seconds } | null }
 *   422 { error, code, item? }   code: RECORDING_IN_ONEDRIVE | NOT_A_VIDEO | NOT_FOUND |
 *                                      NO_ACCESS | LINK_NOT_RECOGNISED | RECORDING_UNREACHABLE
 */

// Shared with the copy-to-library route, so both hand the page the same shape.
const itemDto = videoItemDto;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json().catch(() => ({}));
    const ref = videoRefFromBody(body);
    if (!ref) {
      return NextResponse.json(
        { error: 'Pick a video in SharePoint, or paste its link.', code: 'NO_LINK' },
        { status: 400 },
      );
    }

    let item: ResolvedVideoItem;
    try {
      item = await resolveVideoItemCached(ref);
    } catch (err) {
      if (err instanceof VideoItemError) {
        return NextResponse.json(
          {
            error: videoItemMessage(err.code),
            code: err.code === 'GRAPH_UNAVAILABLE' ? 'RECORDING_UNREACHABLE' : err.code,
          },
          { status: 422 },
        );
      }
      throw err;
    }

    const problem = recordingPolicyProblem(item);
    if (problem) {
      return NextResponse.json(
        { error: videoItemMessage(problem, item), code: problem, item: itemDto(item) },
        { status: 422 },
      );
    }

    let sameAs: {
      track_id: string;
      verdict: ReturnType<typeof sameRecording>;
      checkpoint_count: number;
      previous_duration_seconds: number | null;
    } | null = null;

    const language = typeof body.language === 'string' ? body.language.trim().toLowerCase() : '';
    if (language) {
      const supabase = getSupabaseAdminClient() as any;
      const { data: existing } = await supabase
        .from('nexus_class_recaps')
        .select('id, recording_url, recording_file_name, video_duration_seconds')
        .eq('study_file_id', params.id)
        .eq('language', language)
        .neq('status', 'archived')
        .maybeSingle();

      if (existing?.recording_url) {
        const previous: RecordingFingerprint = {
          name: existing.recording_file_name,
          durationSeconds: existing.video_duration_seconds,
        };
        try {
          const old = await resolveVideoItemCached(existing.recording_url);
          previous.driveId = old.driveId;
          previous.itemId = old.itemId;
          previous.name = old.name;
          previous.sizeBytes = old.sizeBytes;
          previous.durationSeconds = old.durationSeconds ?? previous.durationSeconds;
        } catch {
          // The old file may be gone after a move. The row's own name and
          // length stand in, which is enough for a "likely".
        }

        const { count } = await supabase
          .from('nexus_class_recap_sections')
          .select('id', { count: 'exact', head: true })
          .eq('recap_id', existing.id)
          .is('archived_at', null);

        sameAs = {
          track_id: existing.id,
          verdict: sameRecording(previous, item),
          checkpoint_count: count || 0,
          previous_duration_seconds: previous.durationSeconds ?? null,
        };
      }
    }

    return NextResponse.json({ item: itemDto(item), same_as: sameAs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read that video';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

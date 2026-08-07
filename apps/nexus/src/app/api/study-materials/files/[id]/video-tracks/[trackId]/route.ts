import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getRecapById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * One language track.
 *
 *   PATCH  -> edit it: title, recording link, label, publish/unpublish, and the
 *             generation knobs (segment length, questions served, pass mark).
 *   DELETE -> archive it. Never a hard delete: nexus_class_recap_attempts
 *             cascades from the sections, so removing the row would destroy
 *             every student's passed checkpoints along with it.
 */

const EDITABLE = new Set([
  'title',
  'recording_url',
  'language_label',
  'target_segment_seconds',
  'question_pool_per_segment',
  'questions_per_segment',
  'pass_percentage',
]);

async function loadTrack(trackId: string, fileId: string) {
  const track = await getRecapById(trackId);
  // Refuse a track id that belongs to another chapter, or a class recap id
  // pointed at this route. Both would otherwise be editable by anyone who can
  // edit any chapter.
  if (!track || track.study_file_id !== fileId) return null;
  return track;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const track = await loadTrack(params.trackId, params.id);
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (EDITABLE.has(key)) patch[key] = value;
    }

    if (body.status === 'published' || body.status === 'draft') {
      /**
       * Publishing without checkpoints is a decision, not an accident.
       *
       * It used to be refused outright, and for a real reason: the chapter test
       * was gated on any published recording, and markStudyVideoCompleted only
       * fires when a checkpoint quiz passes, so a checkpoint-less recording was
       * a gate with no key. The gate now counts only recordings a student can
       * actually finish (trackGatesChapter), which makes an OPEN recording safe:
       * watchable, ungated, and it does not complete the chapter.
       *
       * The refusal stays as the default anyway. A teacher who meant to publish
       * a checkpointed recording and forgot the transcript should still be
       * stopped, so the open path needs `allow_open` said out loud.
       */
      if (body.status === 'published') {
        const supabase = getSupabaseAdminClient() as any;
        const { count } = await supabase
          .from('nexus_class_recap_sections')
          .select('id', { count: 'exact', head: true })
          .eq('recap_id', params.trackId)
          .is('archived_at', null);
        if (!count && body.allow_open !== true) {
          return NextResponse.json(
            {
              error:
                'This recording has no checkpoints. Upload its transcript, or publish it as an open recording that does not unlock the test.',
              code: 'NO_SECTIONS',
            },
            { status: 400 },
          );
        }
        patch.readiness = 'ready';
        patch.published_at = new Date().toISOString();
      }
      patch.status = body.status;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('nexus_class_recaps')
      .update(patch)
      .eq('id', params.trackId)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ track: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update the track';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const track = await loadTrack(params.trackId, params.id);
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    // Archived, not deleted. Students stop seeing it immediately; their passed
    // checkpoints and attempt history survive, so restoring it does not cost
    // anyone the work they already did.
    const supabase = getSupabaseAdminClient() as any;
    const { error } = await supabase
      .from('nexus_class_recaps')
      .update({ status: 'archived' })
      .eq('id', params.trackId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove the track';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

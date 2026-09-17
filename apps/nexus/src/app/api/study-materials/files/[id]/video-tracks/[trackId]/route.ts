import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getRecapById, saveRecapSections } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { normalizeRecordingUrl } from '@/lib/sharepoint-transcript';
import { readTrackLanguages, labelForCode } from '@/lib/track-languages';
import { forgetTrackTranscript } from '@/lib/track-transcript';
import { evictMedia } from '@/lib/recording-source-cache';
import { describeTrackRecording, videoRefFromBody } from '@/lib/track-recording';
import {
  classifyRecordingLink,
  findRecordingItem,
  forgetVideoItem,
  recordingPolicyProblem,
  resolveVideoItem,
  sameRecording,
  storedRecordingRef,
  videoItemMessage,
  VideoItemError,
  type RecordingFingerprint,
  type ResolvedVideoItem,
  type SameRecordingVerdict,
} from '@/lib/sharepoint-video';

/**
 * One language track.
 *
 *   PATCH  -> edit it: replace its video, re-file it under another language,
 *             publish or unpublish it, and the generation knobs.
 *   DELETE -> archive it. Never a hard delete: nexus_class_recap_attempts
 *             cascades from the sections, so removing the row would destroy
 *             every student's passed checkpoints along with it.
 *
 * REPLACING THE VIDEO. Checkpoints are timed to one recording, so a different
 * video clears them, and the stored transcript with them. But a teacher moving
 * the SAME recording into the library is not a different video, and clearing
 * its checkpoints would throw away work that is still right. So the new file is
 * compared with the old one (lib/sharepoint-video.ts sameRecording):
 *   same      same file, or same size and name: checkpoints kept, no question
 *   likely    only the length matches: kept only when the teacher confirmed,
 *             `keep_checkpoints: true`, because a trimmed copy would shift them
 *   different cleared, transcript forgotten, back to draft
 *
 * CHANGING THE LANGUAGE is not the same operation. A recording filed under the
 * wrong language is a mis-labelled row, not a different video, so it KEEPS the
 * checkpoints, the publish state and every student's progress.
 */

const EDITABLE = new Set([
  'title',
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

/** Not on the NexusClassRecap type, which predates the column; the row has it. */
function fileNameOf(track: unknown): string | null {
  return (track as { recording_file_name?: string | null }).recording_file_name ?? null;
}

/** The address and, when known, the file's ids. The ids are not on the type either. */
function recordingOf(track: unknown) {
  return storedRecordingRef(
    track as { recording_url?: string | null; recording_drive_id?: string | null; recording_item_id?: string | null },
  );
}

/**
 * Columns a release of the code can write before its migration reaches every
 * environment. Migrations here have silently no-opped before, and losing one of
 * these costs a display name or a lookup shortcut, both with a fallback.
 */
const OPTIONAL_COLUMNS = ['recording_file_name', 'recording_drive_id', 'recording_item_id'];

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

    /* ── A new video ─────────────────────────────────────────────────────── */
    let clearedCheckpoints = false;
    let sameAs: SameRecordingVerdict | null = null;
    const ref = videoRefFromBody(body);

    if (ref) {
      let item: ResolvedVideoItem | null = null;
      try {
        item = await resolveVideoItem(ref);
      } catch (err) {
        if (!(err instanceof VideoItemError)) throw err;
        // Same rule as attaching: only a SharePoint outage can be passed, and
        // only for a pasted link that is not a OneDrive one.
        const canForce =
          err.code === 'GRAPH_UNAVAILABLE' &&
          body.force === true &&
          typeof ref === 'string' &&
          !classifyRecordingLink(ref).oneDrive;
        if (!canForce) {
          return NextResponse.json(
            {
              error: videoItemMessage(err.code),
              code: err.code === 'GRAPH_UNAVAILABLE' ? 'RECORDING_UNREACHABLE' : err.code,
            },
            { status: 422 },
          );
        }
      }

      if (item) {
        const problem = recordingPolicyProblem(item);
        if (problem) {
          return NextResponse.json({ error: videoItemMessage(problem, item), code: problem }, { status: 422 });
        }
      }

      const nextUrl = item?.webUrl || normalizeRecordingUrl(typeof ref === 'string' ? ref : '');
      patch.recording_url = nextUrl;
      // Written even when null: the old name described the old file, and the old
      // ids would keep finding the old video.
      patch.recording_file_name = item?.name ?? null;
      patch.recording_drive_id = item?.driveId || null;
      patch.recording_item_id = item?.itemId || null;
      patch.video_source = 'sharepoint';
      if (item?.durationSeconds) patch.video_duration_seconds = item.durationSeconds;

      // What we know about the recording already attached. Found by its ids when
      // the row has them, so a file whose folder was moved still counts as the
      // same video. A file that has gone leaves the row's own name and length.
      const previous: RecordingFingerprint = {
        name: fileNameOf(track),
        durationSeconds: track.video_duration_seconds,
      };
      const stored = recordingOf(track);
      if (stored) {
        try {
          const { item: old } = await findRecordingItem(stored);
          previous.driveId = old.driveId;
          previous.itemId = old.itemId;
          previous.name = old.name;
          previous.sizeBytes = old.sizeBytes;
          previous.durationSeconds = old.durationSeconds ?? previous.durationSeconds;
        } catch {
          /* see above */
        }
      }

      sameAs = item
        ? sameRecording(previous, item)
        : (track.recording_url || '') === nextUrl
          ? 'same'
          : 'different';
      const keep = sameAs === 'same' || (sameAs === 'likely' && body.keep_checkpoints === true);

      if (!keep) {
        // Safe on both paths: with no attempts this deletes, with attempts it
        // archives, so nobody's passed checkpoints are destroyed either way.
        await saveRecapSections(params.trackId, []);
        // And the transcript goes with them. It was the old video's, and the
        // next "create checkpoints" would otherwise cut the new video with it.
        await forgetTrackTranscript(params.trackId);
        patch.status = 'draft';
        patch.readiness = 'pending';
        patch.published_at = null;
        patch.generated_at = null;
        clearedCheckpoints = true;
      }

      if (stored) {
        forgetVideoItem(stored.url);
        if (stored.driveId && stored.itemId) forgetVideoItem({ driveId: stored.driveId, itemId: stored.itemId });
      }
    }

    /* ── Re-file under another language ──────────────────────────────────── */
    let movedLanguage: string | null = null;
    if (typeof body.language === 'string' && body.language.trim()) {
      const language = body.language.trim().toLowerCase();

      if (language !== track.language) {
        const supabase = getSupabaseAdminClient() as any;
        const languages = await readTrackLanguages(supabase);
        if (!languages.some((l) => l.code === language)) {
          return NextResponse.json(
            { error: `Pick one of the offered languages: ${languages.map((l) => l.code).join(', ')}` },
            { status: 400 },
          );
        }

        /**
         * The slot has to be empty, and "empty" includes archived:
         * uq_class_recaps_study_file_language does not exclude archived rows.
         */
        const { data: occupant } = await supabase
          .from('nexus_class_recaps')
          .select('id, status, language_label, title')
          .eq('study_file_id', params.id)
          .eq('language', language)
          .maybeSingle();

        const targetLabel = labelForCode(languages, language);
        if (occupant) {
          return occupant.status === 'archived'
            ? NextResponse.json(
                {
                  error: `${targetLabel} already holds a recording that was removed earlier. Add a video to ${targetLabel} to bring it back, or replace that video, then move this one.`,
                  code: 'LANGUAGE_ARCHIVED',
                },
                { status: 409 },
              )
            : NextResponse.json(
                {
                  error: `${targetLabel} already has a recording on this chapter. Remove that one first, or pick another language.`,
                  code: 'LANGUAGE_TAKEN',
                },
                { status: 409 },
              );
        }

        patch.language = language;
        patch.language_label = body.language_label ? String(body.language_label) : targetLabel;

        // The title too, but only when it still ends in the old language, in
        // either the label or the bare code form older tracks were made with.
        const suffixes = [
          track.language_label ? ` (${track.language_label})` : '',
          ` (${track.language})`,
        ].filter(Boolean);
        const stale = suffixes.find((s) => typeof track.title === 'string' && track.title.endsWith(s));
        if (stale) {
          patch.title = `${track.title.slice(0, -stale.length)} (${patch.language_label})`;
        }

        // NOT cleared, unlike a video change. Same audio, same timings.
        movedLanguage = String(patch.language_label);
      }
    }

    /* ── Publish or unpublish ────────────────────────────────────────────── */
    if (body.status === 'published' || body.status === 'draft') {
      if (body.status === 'published') {
        const supabase = getSupabaseAdminClient() as any;
        const { count } = await supabase
          .from('nexus_class_recap_sections')
          .select('id', { count: 'exact', head: true })
          .eq('recap_id', params.trackId)
          .is('archived_at', null);
        /**
         * Publishing without checkpoints is a decision, not an accident, so the
         * open path needs `allow_open` said out loud.
         */
        if (!count && body.allow_open !== true) {
          return NextResponse.json(
            {
              error:
                'This recording has no checkpoints. Add its transcript, or publish it without checkpoints so it does not unlock the test.',
              code: 'NO_SECTIONS',
            },
            { status: 400 },
          );
        }

        /**
         * The video has to be one students will be served. A file still in a
         * personal OneDrive, or one that has gone, is refused here as well as on
         * the page, so no route can publish around the library rule. A moment
         * where SharePoint did not answer is never a reason to refuse.
         */
        const url = (patch.recording_url as string | undefined) ?? track.recording_url;
        const source = (patch.video_source as string | undefined) ?? track.video_source;
        if (url && source !== 'youtube') {
          const replaced = 'recording_url' in patch;
          const stored = recordingOf(track);
          const { recording } = await describeTrackRecording({
            video_source: 'sharepoint',
            recording_url: url,
            recording_file_name: (patch.recording_file_name as string | null | undefined) ?? fileNameOf(track),
            video_duration_seconds: track.video_duration_seconds,
            recording_drive_id: replaced ? (patch.recording_drive_id as string | null) : stored?.driveId,
            recording_item_id: replaced ? (patch.recording_item_id as string | null) : stored?.itemId,
          });
          const problem = recording?.problem;
          if (problem && problem !== 'UNRESOLVED') {
            return NextResponse.json(
              { error: videoItemMessage(problem, { name: recording?.name }), code: problem },
              { status: 422 },
            );
          }
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
    const save = () =>
      supabase.from('nexus_class_recaps').update(patch).eq('id', params.trackId).select('*').single();

    let { data, error } = await save();

    /**
     * The schema can be a release behind the code (OPTIONAL_COLUMNS). Drop only
     * the column PostgREST names, one at a time.
     */
    while ((error as { code?: string })?.code === 'PGRST204') {
      const message = (error as { message?: string })?.message || '';
      const missing = OPTIONAL_COLUMNS.find((column) => column in patch && message.includes(column));
      if (!missing) break;
      console.warn(`[video-tracks] ${missing} column missing, saving without it`);
      delete patch[missing];
      ({ data, error } = await save());
    }
    if (error) throw error;

    // The byte proxy caches a resolved file for ten minutes. Without this a
    // preview, or a student, could keep receiving the OLD video after a replace.
    // Only this instance's cache is reachable from here; another server's copy
    // expires on its own TTL.
    if (typeof patch.recording_url === 'string') evictMedia('recap', params.trackId);

    return NextResponse.json({ track: data, clearedCheckpoints, movedLanguage, sameRecording: sameAs });
  } catch (err) {
    /** The language slot was taken between the check above and the update. */
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        {
          error: 'That language was given a recording a moment ago. Reload the page to see it.',
          code: 'LANGUAGE_TAKEN',
        },
        { status: 409 },
      );
    }
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

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getRecapById, saveRecapSections } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractYouTubeId } from '@/lib/youtube';
import { normalizeRecordingUrl } from '@/lib/sharepoint-transcript';
import { resolveRecordingSource } from '@/lib/recording-source';
import { readTrackLanguages, labelForCode } from '@/lib/track-languages';

/**
 * One language track.
 *
 *   PATCH  -> edit it: title, recording link, label, language, publish/unpublish,
 *             and the generation knobs (segment length, questions served, pass
 *             mark).
 *   DELETE -> archive it. Never a hard delete: nexus_class_recap_attempts
 *             cascades from the sections, so removing the row would destroy
 *             every student's passed checkpoints along with it.
 *
 * SWAPPING THE VIDEO IS NOT A FIELD EDIT. recording_url has always been in
 * EDITABLE, so a new link could be written straight over the old one while its
 * checkpoints stayed exactly where they were. Those timings were cut from the
 * OLD recording's transcript, and the two recordings of a chapter are different
 * lengths and pause in different places, so keeping them drops a quiz into the
 * middle of a sentence in the new video. Changing the video therefore clears the
 * checkpoints and returns the track to draft, which is the same conclusion
 * reviveStudyVideoTrack reached for the same reason. Nothing did this before
 * because nothing offered a way to change the video.
 *
 * CHANGING THE LANGUAGE IS NOT THE SAME OPERATION, and the difference is the
 * whole reason it exists. A recording filed under the wrong language is a
 * mis-labelled row, not a different video: the audio, the transcript it was cut
 * from and every checkpoint timing are all still correct. So this one KEEPS the
 * checkpoints, keeps the publish state and keeps every student's progress, and
 * the rule two paragraphs up deliberately does not carry over to it. Without
 * this the only exits were Remove, which archives the row and makes the
 * transcript and the checkpoints have to be built a second time, or Change the
 * video, which clears them on purpose. Both threw away work that was right.
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

    /**
     * A new video, which is a bigger change than the field it arrives in.
     * See the header: the old checkpoints cannot survive it.
     */
    let clearedCheckpoints = false;
    if (typeof body.recording_url === 'string' && body.recording_url.trim()) {
      // Same unwrap-and-classify the POST path does, so a Teams recap link
      // pasted here behaves identically to one pasted when first attaching.
      const nextUrl = normalizeRecordingUrl(body.recording_url.trim());
      const videoSource = extractYouTubeId(nextUrl) ? 'youtube' : 'sharepoint';

      // What the picker saw first, then what Graph reports. The picker's name is
      // the only one available on a forced attach, where nothing is resolved.
      let fileName: string | null = body.recording_file_name
        ? String(body.recording_file_name).slice(0, 300)
        : null;

      if (videoSource === 'sharepoint' && body.force !== true) {
        try {
          const source = await resolveRecordingSource(nextUrl);
          fileName = fileName || source.name;
        } catch (err) {
          const detail = err instanceof Error ? err.message : '';
          return NextResponse.json(
            {
              error: detail.includes('RECORDING_SIZE_UNKNOWN')
                ? 'Nexus found that link but cannot read the file itself, so students would get a broken player. This usually means the file sits in a personal OneDrive that Nexus has no access to. Move it into the Neram library and try again.'
                : 'Nexus could not open that link. Check it points at the video file itself, then try again.',
              code: 'RECORDING_UNREACHABLE',
            },
            { status: 422 },
          );
        }
      }

      patch.recording_url = nextUrl;
      // Written even when null, because the old name described the old file and
      // a stale name is worse than one derived from the URL.
      patch.recording_file_name = fileName;
      patch.video_source = videoSource;

      if ((track.recording_url || '') !== nextUrl) {
        // Safe on both paths: with no attempts this deletes, with attempts it
        // archives, so nobody's passed checkpoints are destroyed either way.
        await saveRecapSections(params.trackId, []);
        patch.status = 'draft';
        patch.readiness = 'pending';
        patch.published_at = null;
        patch.generated_at = null;
        clearedCheckpoints = true;
      }
    }

    /**
     * Re-file the recording under a different language.
     *
     * Handled here rather than by adding 'language' to EDITABLE, because EDITABLE
     * validates nothing and this needs three checks: the code has to be one an
     * admin actually offers, the slot has to be free, and the label has to move
     * with it. A bare passthrough would let a typo reach the CHECK constraint and
     * come back as a 500.
     */
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
         * The slot has to be empty, and "empty" includes archived.
         *
         * uq_class_recaps_study_file_language does not exclude archived rows, so
         * a language whose recording was removed still holds its slot, which is
         * the same fact createStudyVideoTrack has to revive around. Checked here
         * so the teacher gets a sentence naming the recording in the way rather
         * than a 23505 surfacing as a 500.
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
                  error: `${targetLabel} already holds a recording that was removed earlier. Restore it by attaching a video to the ${targetLabel} row, or change that video, then move this one.`,
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
        // The label is stored on the row on purpose (see track-languages.ts), so
        // it has to travel with the code or the row keeps saying "English".
        patch.language_label = body.language_label ? String(body.language_label) : targetLabel;

        /**
         * The title too, but only when it still ends in the old language.
         *
         * POST writes `${file.title} (${label})`, so the generated shape would
         * otherwise read "Ch:1 History Of Architecture (English)" on a Tamil
         * recording. A title a teacher typed by hand is left exactly as it is.
         *
         * BOTH the label and the bare code are matched, because the tracks that
         * most need moving are the oldest ones. Stamping the label at creation
         * arrived after the first tracks did, so those read "(en)" rather than
         * "(English)" and a label-only check would silently skip exactly them.
         */
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
    const save = () =>
      supabase.from('nexus_class_recaps').update(patch).eq('id', params.trackId).select('*').single();

    let { data, error } = await save();

    /**
     * The schema is a release behind the code.
     *
     * Migrations here are applied by GitHub Actions during deploy and have
     * silently no-opped before, so recording_file_name can be absent while this
     * code is live. Dropping it and retrying costs a display name that already
     * has a fallback; not retrying would make every video change 500.
     */
    if (
      (error as { code?: string })?.code === 'PGRST204' &&
      (error as { message?: string })?.message?.includes('recording_file_name')
    ) {
      console.warn('[video-tracks] recording_file_name column missing, saving without it');
      delete patch.recording_file_name;
      ({ data, error } = await save());
    }
    if (error) throw error;

    return NextResponse.json({ track: data, clearedCheckpoints, movedLanguage });
  } catch (err) {
    /**
     * The language slot was taken between the check above and the update.
     *
     * Only reachable as a race, since the ordinary case is answered with a 409
     * that names the occupant. Caught anyway so two teachers pressing Move at
     * the same instant get a conflict rather than a 500.
     */
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        {
          error: 'That language was given a recording a moment ago. Reopen this dialog to see it.',
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

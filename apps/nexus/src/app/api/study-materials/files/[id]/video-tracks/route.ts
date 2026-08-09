import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  listStudyVideoTracks,
  createStudyVideoTrack,
  TrackLanguageTakenError,
  getSupabaseAdminClient,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { extractYouTubeId } from '@/lib/youtube';
import { normalizeRecordingUrl } from '@/lib/sharepoint-transcript';
import { resolveRecordingSource } from '@/lib/recording-source';
import { readTrackLanguages, trackLanguageOrder, labelForCode } from '@/lib/track-languages';

/**
 * Language tracks on a Foundation chapter.
 *
 *   GET  -> every track, drafts and held ones included, so the editor can show
 *           what state each recording is in, plus the languages on offer so the
 *           editor can render a slot for each without a second round trip.
 *   POST -> attach a recording for one language. Body:
 *           { language, language_label?, title?, recording_url, transcript_url? }
 *
 * A chapter may hold one track per language and no more, enforced by
 * uq_class_recaps_study_file_language rather than by a check here, so two
 * teachers pressing save at once cannot both win.
 *
 * Only some recordings exist so far. That is deliberately fine: a chapter with
 * one track behaves exactly like a chapter with two, and the student picker only
 * ever shows what is actually there.
 *
 * WHICH LANGUAGES ARE OFFERED is nexus_settings.study_track_languages, read on
 * every request rather than compiled in. This used to be a three-item const
 * here and four more copies elsewhere, so offering a chapter in Hindi meant a
 * migration and a deploy.
 */

/**
 * Prove the server can actually play this file before agreeing to store it.
 *
 * Student playback resolves the stored URL APP-ONLY, through /shares/{id}, and
 * that is a different permission from the one a teacher used to find the file.
 * A recording in someone's personal OneDrive is the case that makes the gap
 * visible: the teacher can search their own drive with their own token and pick
 * a file the application itself cannot read. Attaching it would succeed, publish
 * would succeed, and the failure would surface to a student staring at a broken
 * player, which is the worst possible place to discover it.
 *
 * Returns null when the file is playable, or a teacher-readable reason when it
 * is not. YouTube skips this entirely: it never goes through Graph.
 */
async function preflightPlayback(
  recordingUrl: string,
): Promise<{ problem: string | null; fileName: string | null }> {
  try {
    // The driveItem carries the real file name, which is the one thing the URL
    // cannot always be made to give up: a SharePoint list link says
    // "DispForm.aspx" and a share link says nothing at all. Free here, since
    // this call is being made anyway.
    const source = await resolveRecordingSource(recordingUrl);
    return { problem: null, fileName: source.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    return {
      problem: message.includes('RECORDING_SIZE_UNKNOWN')
        ? 'Nexus found that link but cannot read the file itself, so students would get a broken player. This usually means the file sits in a personal OneDrive that Nexus has no access to. Move it into the Neram library and attach it again.'
        : 'Nexus could not open that link. Check it points at the video file itself, then try again.',
      fileName: null,
    };
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const languages = await readTrackLanguages(getSupabaseAdminClient());
    const tracks = await listStudyVideoTracks(params.id, undefined, trackLanguageOrder(languages));
    return NextResponse.json({ tracks, languages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tracks';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const language = String(body.language || '').trim().toLowerCase();
    const rawUrl = String(body.recording_url || '').trim();

    const languages = await readTrackLanguages(getSupabaseAdminClient());
    if (!languages.some((l) => l.code === language)) {
      return NextResponse.json(
        { error: `Pick one of the offered languages: ${languages.map((l) => l.code).join(', ')}` },
        { status: 400 },
      );
    }
    if (!rawUrl) {
      return NextResponse.json({ error: 'A recording link is required' }, { status: 400 });
    }

    // A Teams meetingrecap link carries the real SharePoint file URL in its
    // `fileUrl` param and is not resolvable by Graph on its own, so unwrap it
    // before storing. Harmless for a plain SharePoint or YouTube link.
    const recordingUrl = normalizeRecordingUrl(rawUrl);

    // Which player the student gets. Both are fully supported downstream; only
    // this classification was missing, which is why YouTube recordings could
    // not be attached even though the embed route already served them.
    const videoSource = extractYouTubeId(recordingUrl) ? 'youtube' : 'sharepoint';

    // Refuse a recording students could not watch, unless the teacher overrides.
    // The override exists because this check depends on Graph being reachable
    // right now, and a transient blip must not be able to lock a teacher out of
    // their own chapter. Default closed, escape hatch open.
    /**
     * The name to show the teacher, in preference order: what the picker saw,
     * then what Graph reports, then nothing and let the URL be derived from.
     * The picker's name is first because it is the only one available on a
     * forced attach, where the preflight was skipped.
     */
    let fileName: string | null = body.recording_file_name
      ? String(body.recording_file_name).slice(0, 300)
      : null;

    if (videoSource === 'sharepoint' && body.force !== true) {
      const preflight = await preflightPlayback(recordingUrl);
      if (preflight.problem) {
        return NextResponse.json(
          { error: preflight.problem, code: 'RECORDING_UNREACHABLE' },
          { status: 422 },
        );
      }
      fileName = fileName || preflight.fileName;
    }

    // Stamp the LABEL here, from the configured list. It used to be left to the
    // query layer's fallback map, which only knew en, ta and ta_en, so a
    // language an admin added would have shown up in the student picker as the
    // bare code. Same for the title, which read "Ch:1 History (ta)".
    const label = labelForCode(languages, language);
    const result = await createStudyVideoTrack({
      studyFileId: params.id,
      language,
      languageLabel: body.language_label ? String(body.language_label) : label,
      title: body.title ? String(body.title) : `${file.title} (${label})`,
      recordingUrl,
      recordingFileName: fileName,
      videoSource,
      transcriptUrl: body.transcript_url ? String(body.transcript_url) : null,
      createdBy: user.id,
    });

    return NextResponse.json(result, { status: result.restored ? 200 : 201 });
  } catch (err) {
    if (err instanceof TrackLanguageTakenError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    /**
     * A language the database has not been told about yet.
     *
     * chk_class_recaps_language still pins the vocabulary to en, ta and ta_en
     * until 20260822090000 is applied, so an admin who adds Hindi under Manage
     * languages gets a 23514 from Postgres the moment a teacher pastes a link.
     * The API accepted it and the constraint refused it, which surfaces as a
     * 500 with no hint of the cause. This does not fix the mismatch, it names
     * it, and the message stays true after the migration lands because it can
     * only be reached when the constraint actually rejects the code.
     */
    if ((err as { code?: string })?.code === '23514') {
      return NextResponse.json(
        {
          error:
            'The database has not been told about this language yet. It is on the offered list, but the pending language migration has not been applied to this environment.',
          code: 'LANGUAGE_NOT_MIGRATED',
        },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to add the track';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

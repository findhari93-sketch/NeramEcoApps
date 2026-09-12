import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  listStudyVideoTracks,
  createStudyVideoTrack,
  TrackLanguageTakenError,
  getSupabaseAdminClient,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { normalizeRecordingUrl } from '@/lib/sharepoint-transcript';
import { readTrackLanguages, trackLanguageOrder, labelForCode } from '@/lib/track-languages';
import { forgetTrackTranscript } from '@/lib/track-transcript';
import { countQuestionsByTrack, describeTrackRecording, videoRefFromBody } from '@/lib/track-recording';
import { libraryVideoRootSegments } from '@/lib/library-copy';
import {
  classifyRecordingLink,
  getLibraryVideoFolderUrl,
  recordingPolicyProblem,
  resolveVideoItem,
  videoItemMessage,
  VideoItemError,
  type ResolvedVideoItem,
} from '@/lib/sharepoint-video';

/**
 * Language tracks on a Foundation chapter.
 *
 *   GET  -> every track, drafts and held ones included, plus the languages on
 *           offer. With ?resolve=1 (the recordings page) each track also carries
 *           what SharePoint says about its video, its stored transcript and its
 *           question count. Without it (the Setup checklist, which only counts)
 *           no SharePoint call is made.
 *   POST -> attach a recording for one language. Body:
 *           { language, drive_id, item_id } for a file picked in Nexus, or
 *           { language, recording_url } for a pasted link.
 *
 * VIDEOS ARE NEVER UPLOADED HERE, and they have to live in the shared Neram
 * SharePoint library. A picked or pasted file is looked up in SharePoint first:
 * the address stored is the one SharePoint reports for the file, never the link
 * it arrived as, which is how a Tamil recording ended up named "DispForm.aspx".
 * A file in a personal OneDrive is refused, and that refusal cannot be forced.
 *
 * A chapter may hold one track per language and no more, enforced by
 * uq_class_recaps_study_file_language rather than by a check here, so two
 * teachers pressing save at once cannot both win.
 *
 * WHICH LANGUAGES ARE OFFERED is nexus_settings.study_track_languages, read on
 * every request rather than compiled in.
 */

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const supabase = getSupabaseAdminClient() as any;
    const languages = await readTrackLanguages(supabase);
    const tracks = await listStudyVideoTracks(params.id, undefined, trackLanguageOrder(languages));

    if (request.nextUrl.searchParams.get('resolve') !== '1') {
      return NextResponse.json({ tracks, languages });
    }

    const ids = tracks.map((t) => t.id);
    const [descriptions, transcriptRows, questionCounts, libraryFolderUrl] = await Promise.all([
      Promise.all(tracks.map((t) => describeTrackRecording(t))),
      ids.length
        ? supabase
            .from('nexus_class_recap_transcripts')
            .select('recap_id, source, status, segments')
            .in('recap_id', ids)
            .then(
              (res: { data: unknown[] | null }) => res.data || [],
              () => [],
            )
        : Promise.resolve([]),
      countQuestionsByTrack(supabase, ids).catch(() => new Map<string, number>()),
      getLibraryVideoFolderUrl(),
    ]);

    // Fill in a name or length the row was missing, once. Best effort: a failed
    // write only means the next load looks the file up again.
    await Promise.all(
      descriptions.map((d, i) =>
        Object.keys(d.backfill).length
          ? supabase
              .from('nexus_class_recaps')
              .update(d.backfill)
              .eq('id', tracks[i].id)
              .then(undefined, () => undefined)
          : undefined,
      ),
    );

    const transcripts = new Map(
      (transcriptRows as { recap_id: string; source: string | null; status: string | null; segments: number | null }[]).map(
        (row) => [row.recap_id, row],
      ),
    );

    return NextResponse.json({
      tracks: tracks.map((t, i) => {
        const d = descriptions[i];
        const transcript = transcripts.get(t.id);
        return {
          ...t,
          recording_file_name: t.recording_file_name ?? d.backfill.recording_file_name ?? null,
          video_duration_seconds: t.video_duration_seconds ?? d.backfill.video_duration_seconds ?? null,
          recording: d.recording,
          transcript: transcript
            ? { source: transcript.source ?? null, status: transcript.status ?? null, segments: transcript.segments ?? null }
            : null,
          question_count: questionCounts.get(t.id) ?? 0,
        };
      }),
      languages,
      // folder_path lets the page name the folder a OneDrive video is copied into.
      library: { folder_url: libraryFolderUrl, folder_path: libraryVideoRootSegments(process.env.SHAREPOINT_VIDEO_ROOT).join('/') },
    });
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

    const supabase = getSupabaseAdminClient() as any;
    const languages = await readTrackLanguages(supabase);
    if (!languages.some((l) => l.code === language)) {
      return NextResponse.json(
        { error: `Pick one of the offered languages: ${languages.map((l) => l.code).join(', ')}` },
        { status: 400 },
      );
    }

    const ref = videoRefFromBody(body);
    if (!ref) {
      return NextResponse.json(
        { error: 'Pick the recording in SharePoint, or paste its link.', code: 'NO_LINK' },
        { status: 400 },
      );
    }

    let item: ResolvedVideoItem | null = null;
    try {
      item = await resolveVideoItem(ref);
    } catch (err) {
      if (!(err instanceof VideoItemError)) throw err;
      /**
       * Only a SharePoint outage can be attached past, and only for a pasted
       * link that is not a OneDrive one. Graph being busy must not lock a
       * teacher out of their chapter; a bad link or the library rule must not
       * be clickable past.
       */
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

    const recordingUrl = item?.webUrl || normalizeRecordingUrl(typeof ref === 'string' ? ref : '');

    // Stamp the LABEL here, from the configured list, so a language an admin
    // added shows its own name rather than a bare code.
    const label = labelForCode(languages, language);
    const result = await createStudyVideoTrack({
      studyFileId: params.id,
      language,
      languageLabel: body.language_label ? String(body.language_label) : label,
      title: body.title ? String(body.title) : `${file.title} (${label})`,
      recordingUrl,
      recordingFileName: item?.name ?? null,
      videoSource: 'sharepoint',
      transcriptUrl: body.transcript_url ? String(body.transcript_url) : null,
      createdBy: user.id,
    });

    // The length SharePoint measured. Nothing else writes it for a chapter track,
    // and the checkpoint editor needs it to warn about a checkpoint past the end.
    if (item?.durationSeconds) {
      await supabase
        .from('nexus_class_recaps')
        .update({ video_duration_seconds: item.durationSeconds })
        .eq('id', result.track.id)
        .then(undefined, () => undefined);
    }

    // A restored track whose video changed had its checkpoints cleared by the
    // query layer, but not its stored transcript, which described the old video.
    if (result.restored && result.checkpointsCleared) {
      await forgetTrackTranscript(result.track.id);
    }

    return NextResponse.json(result, { status: result.restored ? 200 : 201 });
  } catch (err) {
    if (err instanceof TrackLanguageTakenError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    /**
     * A language the database has not been told about yet: the offered list has
     * it but the pending language migration has not reached this environment.
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

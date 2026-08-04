import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  listStudyVideoTracks,
  createStudyVideoTrack,
  TrackLanguageTakenError,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * Language tracks on a Foundation chapter.
 *
 *   GET  -> every track, drafts and held ones included, so the editor can show
 *           what state each recording is in.
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
 */

const LANGUAGES = ['en', 'ta', 'ta_en'] as const;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const tracks = await listStudyVideoTracks(params.id);
    return NextResponse.json({ tracks });
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
    const language = String(body.language || '').trim();
    const recordingUrl = String(body.recording_url || '').trim();

    if (!LANGUAGES.includes(language as (typeof LANGUAGES)[number])) {
      return NextResponse.json({ error: 'Pick a language: en, ta or ta_en' }, { status: 400 });
    }
    if (!recordingUrl) {
      return NextResponse.json({ error: 'A recording link is required' }, { status: 400 });
    }

    const track = await createStudyVideoTrack({
      studyFileId: params.id,
      language: language as (typeof LANGUAGES)[number],
      languageLabel: body.language_label ? String(body.language_label) : null,
      title: body.title ? String(body.title) : `${file.title} (${language})`,
      recordingUrl,
      transcriptUrl: body.transcript_url ? String(body.transcript_url) : null,
      createdBy: user.id,
    });

    return NextResponse.json({ track }, { status: 201 });
  } catch (err) {
    if (err instanceof TrackLanguageTakenError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Failed to add the track';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

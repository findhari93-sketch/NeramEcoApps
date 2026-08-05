import { NextRequest, NextResponse } from 'next/server';
import { getStudyVideoState, getSupabaseAdminClient } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeChapter, trackErrorResponse } from '@/lib/study-video-access';
import { readTrackLanguages, trackLanguageOrder } from '@/lib/track-languages';

/**
 * GET /api/student/study-videos/[fileId]
 *
 * The language picker for a Foundation chapter: which recordings exist, how far
 * this student has got in each, and where the chapter as a whole stands.
 *
 * Only servable tracks appear. A draft or held track is invisible here for the
 * same reason it does not gate the chapter test: a student cannot be asked to
 * finish a video nobody has published.
 */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    await assertCanSeeChapter(user, params.fileId);
    // Ordered by the list the admin arranged, so the picker reads the same way
    // on every chapter and does not reshuffle when a language is added.
    const languages = await readTrackLanguages(getSupabaseAdminClient());
    const state = await getStudyVideoState(
      params.fileId,
      user.id,
      undefined,
      trackLanguageOrder(languages),
    );
    return NextResponse.json(state);
  } catch (err) {
    const { error, status } = trackErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}

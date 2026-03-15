import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getChapterTranscript,
  getChapterTranscriptLanguages,
} from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters/[id]/transcript?lang=en
 * Returns transcript entries for a chapter in the requested language.
 * Also returns available languages.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id: chapterId } = await params;
    const lang = request.nextUrl.searchParams.get('lang') || 'en';

    const [transcript, languages] = await Promise.all([
      getChapterTranscript(chapterId, lang),
      getChapterTranscriptLanguages(chapterId),
    ]);

    return NextResponse.json({
      entries: transcript?.entries || [],
      language: lang,
      available_languages: languages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load transcript';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

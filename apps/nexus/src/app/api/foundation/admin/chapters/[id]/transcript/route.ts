import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getChapterTranscript,
  getChapterTranscriptLanguages,
  upsertChapterTranscript,
} from '@neram/database/queries/nexus';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

/**
 * GET /api/foundation/admin/chapters/[id]/transcript?lang=en
 * Get transcript for a chapter (teacher view)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyTeacher(request);
    const { id: chapterId } = await params;
    const lang = request.nextUrl.searchParams.get('lang') || 'en';

    const [transcript, languages] = await Promise.all([
      getChapterTranscript(chapterId, lang),
      getChapterTranscriptLanguages(chapterId),
    ]);

    return NextResponse.json({
      transcript,
      available_languages: languages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load transcript';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/foundation/admin/chapters/[id]/transcript
 * Create or update transcript: { language: "en", entries: [...] }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyTeacher(request);
    const { id: chapterId } = await params;
    const body = await request.json();

    if (!body.language || !Array.isArray(body.entries)) {
      return NextResponse.json(
        { error: 'language and entries[] are required' },
        { status: 400 }
      );
    }

    const transcript = await upsertChapterTranscript(
      chapterId,
      body.language,
      body.entries
    );

    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save transcript';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

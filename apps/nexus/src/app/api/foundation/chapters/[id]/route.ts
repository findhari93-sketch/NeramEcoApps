import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getFoundationChapterDetail } from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters/[id]
 *
 * Returns a single chapter with sections, quiz questions, and student progress/notes.
 * Quiz questions returned WITHOUT correct answers (for student view).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: chapterId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await getFoundationChapterDetail(chapterId, user.id);

    // Strip correct answers from quiz questions for student view
    const sections = result.sections.map(section => ({
      ...section,
      quiz_questions: section.quiz_questions.map(q => ({
        id: q.id,
        section_id: q.section_id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        sort_order: q.sort_order,
      })),
    }));

    return NextResponse.json({
      chapter: result.chapter,
      sections,
      progress: result.progress,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load chapter';
    console.error('Foundation chapter detail GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

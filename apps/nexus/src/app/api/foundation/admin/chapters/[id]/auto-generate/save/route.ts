import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createFoundationSection,
  createFoundationQuizQuestion,
} from '@neram/database/queries/nexus';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
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
 * POST /api/foundation/admin/chapters/[id]/auto-generate/save
 * Bulk save AI-generated sections and questions for a foundation chapter.
 * Body: { sections: [{ title, description, start_timestamp_seconds, end_timestamp_seconds, questions: [...] }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyTeacher(request);
    const { id: chapterId } = await params;
    const body = await request.json();

    if (!body.sections || !Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: 'No sections to save' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Get current max sort_order for existing sections
    const { data: existingSections } = await supabase
      .from('nexus_foundation_sections')
      .select('sort_order')
      .eq('chapter_id', chapterId)
      .order('sort_order', { ascending: false })
      .limit(1);

    let nextSortOrder = (existingSections?.[0]?.sort_order ?? -1) + 1;

    const createdSections = [];

    for (const section of body.sections) {
      if (!section.title?.trim() || section.start_timestamp_seconds == null || section.end_timestamp_seconds == null) {
        continue;
      }

      if (section.end_timestamp_seconds <= section.start_timestamp_seconds) {
        continue;
      }

      const createdSection = await createFoundationSection({
        chapter_id: chapterId,
        title: section.title.trim(),
        description: section.description?.trim() || null,
        start_timestamp_seconds: section.start_timestamp_seconds,
        end_timestamp_seconds: section.end_timestamp_seconds,
        sort_order: nextSortOrder,
        min_questions_to_pass: null,
      });

      if (!createdSection) {
        continue;
      }

      nextSortOrder++;

      const questions = section.questions || [];
      const createdQuestions = [];

      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];

        if (!q.question_text?.trim() || !q.option_a?.trim() || !q.option_b?.trim() ||
            !q.option_c?.trim() || !q.option_d?.trim()) {
          continue;
        }

        const correctOption = ['a', 'b', 'c', 'd'].includes(q.correct_option)
          ? q.correct_option
          : 'a';

        const createdQ = await createFoundationQuizQuestion({
          section_id: createdSection.id,
          question_text: q.question_text.trim(),
          option_a: q.option_a.trim(),
          option_b: q.option_b.trim(),
          option_c: q.option_c.trim(),
          option_d: q.option_d.trim(),
          correct_option: correctOption,
          explanation: q.explanation?.trim() || null,
          sort_order: qi,
        });

        if (createdQ) {
          createdQuestions.push(createdQ);
        }
      }

      createdSections.push({
        ...createdSection,
        quiz_questions: createdQuestions,
      });
    }

    return NextResponse.json(
      { sections: createdSections, count: createdSections.length },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save sections';
    console.error('Auto-generate save error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

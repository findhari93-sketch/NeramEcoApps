import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

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
 * POST /api/modules/[id]/items/[itemId]/auto-generate/save
 * Bulk save AI-generated sections and questions.
 * Body: { sections: [{ title, description, start_timestamp_seconds, end_timestamp_seconds, questions: [...] }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { itemId } = await params;
    const body = await request.json();

    if (!body.sections || !Array.isArray(body.sections) || body.sections.length === 0) {
      return NextResponse.json({ error: 'No sections to save' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Get current max sort_order for existing sections
    const { data: existingSections } = await supabase
      .from('nexus_module_item_sections')
      .select('sort_order')
      .eq('module_item_id', itemId)
      .order('sort_order', { ascending: false })
      .limit(1);

    let nextSortOrder = (existingSections?.[0]?.sort_order ?? -1) + 1;

    const createdSections = [];

    for (const section of body.sections) {
      // Validate section
      if (!section.title?.trim() || section.start_timestamp_seconds == null || section.end_timestamp_seconds == null) {
        continue;
      }

      if (section.end_timestamp_seconds <= section.start_timestamp_seconds) {
        continue;
      }

      // Insert section
      const { data: createdSection, error: sectionError } = await supabase
        .from('nexus_module_item_sections')
        .insert({
          module_item_id: itemId,
          title: section.title.trim(),
          description: section.description?.trim() || null,
          start_timestamp_seconds: section.start_timestamp_seconds,
          end_timestamp_seconds: section.end_timestamp_seconds,
          sort_order: nextSortOrder,
          min_questions_to_pass: null,
        })
        .select()
        .single();

      if (sectionError || !createdSection) {
        console.error('Failed to create section:', sectionError?.message);
        continue;
      }

      nextSortOrder++;

      // Insert questions for this section
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

        const { data: createdQ, error: qError } = await supabase
          .from('nexus_module_item_quiz_questions')
          .insert({
            section_id: createdSection.id,
            question_text: q.question_text.trim(),
            option_a: q.option_a.trim(),
            option_b: q.option_b.trim(),
            option_c: q.option_c.trim(),
            option_d: q.option_d.trim(),
            correct_option: correctOption,
            explanation: q.explanation?.trim() || null,
            sort_order: qi,
          })
          .select()
          .single();

        if (!qError && createdQ) {
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

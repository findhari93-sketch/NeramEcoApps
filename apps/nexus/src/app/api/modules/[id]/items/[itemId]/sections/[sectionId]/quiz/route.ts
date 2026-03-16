import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]/items/[itemId]/sections/[sectionId]/quiz
 * Get quiz questions for a section (stripped of answers).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    const { sectionId } = await params;
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: questions, error } = await supabase
      .from('nexus_module_item_quiz_questions')
      .select('*')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Strip correct_option and explanation for student view
    const stripped = (questions || []).map((q: any) => {
      const { correct_option, explanation, ...rest } = q;
      return rest;
    });

    return NextResponse.json({ questions: stripped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load quiz';
    console.error('Module quiz GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/modules/[id]/items/[itemId]/sections/[sectionId]/quiz
 * Submit quiz attempt.
 * Body: { answers: { [questionId]: 'a'|'b'|'c'|'d' } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    const { itemId, sectionId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    if (!body.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers object' }, { status: 400 });
    }

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch questions WITH correct_option for grading
    const { data: questions, error: qError } = await supabase
      .from('nexus_module_item_quiz_questions')
      .select('*')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: true });

    if (qError) throw qError;
    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found for this section' }, { status: 404 });
    }

    // Grade the answers
    let correctCount = 0;
    const totalCount = questions.length;
    const questionsWithExplanations = questions.map((q: any) => {
      const studentAnswer = body.answers[q.id] || null;
      const isCorrect = studentAnswer === q.correct_option;
      if (isCorrect) correctCount++;
      return {
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        student_answer: studentAnswer,
        is_correct: isCorrect,
      };
    });

    // Get section's min_questions_to_pass
    const { data: section } = await supabase
      .from('nexus_module_item_sections')
      .select('min_questions_to_pass')
      .eq('id', sectionId)
      .single();

    const minToPass = section?.min_questions_to_pass ?? totalCount; // null = all must be correct
    const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = correctCount >= minToPass;

    // Count previous attempts
    const { count: previousAttempts } = await supabase
      .from('nexus_module_quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('section_id', sectionId);

    const attemptNumber = (previousAttempts || 0) + 1;

    // Insert new attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('nexus_module_quiz_attempts')
      .insert({
        student_id: user.id,
        section_id: sectionId,
        answers: body.answers,
        score_pct: scorePct,
        passed,
        attempt_number: attemptNumber,
      })
      .select()
      .single();

    if (attemptError) throw attemptError;

    // If passed, check if ALL sections in this item are now passed
    if (passed) {
      const { data: allSections } = await supabase
        .from('nexus_module_item_sections')
        .select('id')
        .eq('module_item_id', itemId);

      if (allSections && allSections.length > 0) {
        const allSectionIds = allSections.map((s: any) => s.id);

        // For each section, check if there's at least one passed attempt
        const { data: passedAttempts } = await supabase
          .from('nexus_module_quiz_attempts')
          .select('section_id')
          .eq('student_id', user.id)
          .in('section_id', allSectionIds)
          .eq('passed', true);

        const passedSectionIds = new Set((passedAttempts || []).map((a: any) => a.section_id));
        const allPassed = allSectionIds.every((sid: string) => passedSectionIds.has(sid));

        if (allPassed) {
          // Upsert progress to 'completed'
          await supabase
            .from('nexus_module_student_progress')
            .upsert(
              {
                student_id: user.id,
                module_item_id: itemId,
                status: 'completed',
                completed_at: new Date().toISOString(),
              },
              { onConflict: 'student_id,module_item_id' }
            );
        }
      }
    }

    return NextResponse.json({
      attempt: {
        ...attempt,
        correct_count: correctCount,
        total_count: totalCount,
        min_to_pass: minToPass,
        questions_with_explanations: questionsWithExplanations,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit quiz';
    console.error('Module quiz POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

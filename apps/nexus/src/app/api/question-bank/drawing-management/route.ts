import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    // Verify teacher/admin role
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const yearFilter = params.get('year');

    // Fetch DRAWING_PROMPT questions from QB with their sources
    let query = supabase
      .from('nexus_qb_questions')
      .select('id, question_text, difficulty, categories, solution_image_url, solution_video_url, objects_to_include, colour_constraint, design_principle_tested, is_active, created_at')
      .eq('question_format', 'DRAWING_PROMPT')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const { data: qbQuestions, error: qbError } = await query;
    if (qbError) throw qbError;

    if (!qbQuestions || qbQuestions.length === 0) {
      return NextResponse.json({ questions: [], available_years: [] });
    }

    // Fetch sources for year info
    const qbIds = qbQuestions.map((q: any) => q.id);
    const { data: sources } = await supabase
      .from('nexus_qb_question_sources')
      .select('question_id, year, question_number')
      .in('question_id', qbIds);

    const sourceMap: Record<string, { year: number; question_number: number | null }> = {};
    const yearSet = new Set<number>();
    for (const s of (sources || []) as any[]) {
      sourceMap[s.question_id] = { year: s.year, question_number: s.question_number };
      yearSet.add(s.year);
    }

    // Fetch linked drawing_questions for bridge status
    const { data: drawingLinks } = await supabase
      .from('drawing_questions')
      .select('id, qb_question_id')
      .in('qb_question_id', qbIds)
      .eq('is_active', true);

    const drawingMap: Record<string, string> = {};
    for (const dl of (drawingLinks || []) as any[]) {
      drawingMap[dl.qb_question_id] = dl.id;
    }

    // Assemble results
    let questions = qbQuestions.map((q: any) => {
      const source = sourceMap[q.id];
      return {
        id: q.id,
        question_text: q.question_text,
        difficulty: q.difficulty,
        categories: q.categories,
        solution_image_url: q.solution_image_url,
        solution_video_url: q.solution_video_url,
        objects_to_include: q.objects_to_include,
        colour_constraint: q.colour_constraint,
        design_principle_tested: q.design_principle_tested,
        drawing_question_id: drawingMap[q.id] || null,
        year: source?.year || null,
        question_number: source?.question_number || null,
      };
    });

    // Filter by year if specified
    if (yearFilter) {
      const y = parseInt(yearFilter);
      questions = questions.filter((q: any) => q.year === y);
    }

    // Sort by year desc, then question_number asc
    questions.sort((a: any, b: any) => {
      if (a.year !== b.year) return (b.year || 0) - (a.year || 0);
      return (a.question_number || 999) - (b.question_number || 999);
    });

    const availableYears = [...yearSet].sort((a, b) => b - a);

    return NextResponse.json({ questions, available_years: availableYears });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Drawing Management API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

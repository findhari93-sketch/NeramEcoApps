import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]/items/[itemId]/detail
 * Get module item detail with sections, quiz questions, and student progress.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Look up user from msUser.oid
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    // Fetch item
    const { data: item, error: itemError } = await supabase
      .from('nexus_module_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch sections ordered by sort_order
    const { data: sections, error: sectionsError } = await supabase
      .from('nexus_module_item_sections')
      .select('*')
      .eq('module_item_id', itemId)
      .order('sort_order', { ascending: true });

    if (sectionsError) throw sectionsError;

    // For each section, fetch quiz questions
    const sectionIds = (sections || []).map((s: any) => s.id);
    let allQuestions: any[] = [];
    if (sectionIds.length > 0) {
      const { data: questions, error: qError } = await supabase
        .from('nexus_module_item_quiz_questions')
        .select('*')
        .in('section_id', sectionIds)
        .order('sort_order', { ascending: true });

      if (qError) throw qError;
      allQuestions = questions || [];
    }

    // Strip correct_option and explanation for student view
    const strippedQuestions = allQuestions.map((q: any) => {
      const { correct_option, explanation, ...rest } = q;
      return rest;
    });

    // Attach questions to their sections
    const sectionsWithQuestions = (sections || []).map((section: any) => ({
      ...section,
      quiz_questions: strippedQuestions.filter((q: any) => q.section_id === section.id),
    }));

    // Fetch student-specific data if user found
    let progress = null;
    let quizAttempts: any[] = [];
    let notes: any[] = [];

    if (user) {
      // Fetch progress
      const { data: progressData } = await supabase
        .from('nexus_module_student_progress')
        .select('*')
        .eq('student_id', user.id)
        .eq('module_item_id', itemId)
        .single();

      progress = progressData || null;

      // Fetch quiz attempts
      if (sectionIds.length > 0) {
        const { data: attempts } = await supabase
          .from('nexus_module_quiz_attempts')
          .select('*')
          .eq('student_id', user.id)
          .in('section_id', sectionIds)
          .order('created_at', { ascending: false });

        quizAttempts = attempts || [];
      }

      // Fetch notes
      if (sectionIds.length > 0) {
        const { data: notesData } = await supabase
          .from('nexus_module_student_notes')
          .select('*')
          .eq('student_id', user.id)
          .in('section_id', sectionIds);

        notes = notesData || [];
      }
    }

    // Fetch audio tracks for this module item
    const { data: audioTracks } = await supabase
      .from('nexus_audio_tracks')
      .select('*')
      .eq('module_item_id', itemId)
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      item: {
        ...item,
        sections: sectionsWithQuestions,
        progress,
        quiz_attempts: quizAttempts,
        notes,
        audio_tracks: audioTracks || [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load item detail';
    console.error('Module item detail GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

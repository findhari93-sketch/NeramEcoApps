import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/questions?classroom={id}&mode=submissions|bank
 * mode=submissions: pending student submissions (teacher)
 * mode=bank: verified question bank (teacher + students)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const mode = request.nextUrl.searchParams.get('mode') || 'bank';
    const topicId = request.nextUrl.searchParams.get('topic');
    const difficulty = request.nextUrl.searchParams.get('difficulty');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (mode === 'submissions') {
      // Teacher: pending question submissions
      let query = supabase
        .from('nexus_question_submissions')
        .select('*, student:users!nexus_question_submissions_student_id_fkey(name), topic:nexus_topics(title)')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });

      const status = request.nextUrl.searchParams.get('status') || 'pending';
      query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ submissions: data || [] });
    } else {
      // Question bank (verified questions)
      let query = supabase
        .from('nexus_verified_questions')
        .select('*, topic:nexus_topics(title)')
        .eq('classroom_id', classroomId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (topicId) query = query.eq('topic_id', topicId);
      if (difficulty) query = query.eq('difficulty', difficulty);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ questions: data || [] });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    console.error('Questions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/questions
 * Student: submit a question from an exam
 * Teacher: add a verified question to the bank
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check role
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', body.classroom_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    if (enrollment.role === 'teacher') {
      // Teacher adds to verified bank
      const { data: question, error } = await supabase
        .from('nexus_verified_questions')
        .insert({
          classroom_id: body.classroom_id,
          topic_id: body.topic_id || null,
          question_text: body.question_text,
          question_image_url: body.question_image_url || null,
          question_type: body.question_type || 'mcq',
          options: body.options || null,
          correct_answer: body.correct_answer || null,
          explanation: body.explanation || null,
          difficulty: body.difficulty || 'medium',
          source_exam: body.source_exam || null,
          source_year: body.source_year || null,
          tags: body.tags || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ question }, { status: 201 });
    } else {
      // Student submits a question from an exam
      const { data: submission, error } = await supabase
        .from('nexus_question_submissions')
        .insert({
          classroom_id: body.classroom_id,
          student_id: user.id,
          topic_id: body.topic_id || null,
          exam_name: body.exam_name,
          exam_date: body.exam_date || null,
          question_text: body.question_text,
          question_image_url: body.question_image_url || null,
          options: body.options || null,
          correct_answer: body.correct_answer || null,
          difficulty: body.difficulty || null,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ submission }, { status: 201 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save question';
    console.error('Questions POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/questions
 * Teacher: verify/reject/merge a student submission, or update a bank question
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient();

    if (body.submission_id) {
      // Update a student submission (verify/reject/merge)
      const updateData: any = { status: body.status };
      if (body.merged_into) updateData.merged_into = body.merged_into;

      const { data, error } = await supabase
        .from('nexus_question_submissions')
        .update(updateData)
        .eq('id', body.submission_id)
        .select()
        .single();

      if (error) throw error;

      // If verifying, also add to question bank
      if (body.status === 'verified' && data) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('ms_oid', msUser.oid)
          .single();

        await supabase.from('nexus_verified_questions').insert({
          classroom_id: data.classroom_id,
          topic_id: data.topic_id,
          question_text: data.question_text,
          question_image_url: data.question_image_url,
          question_type: 'mcq',
          options: data.options,
          correct_answer: data.correct_answer,
          difficulty: data.difficulty || 'medium',
          source_exam: data.exam_name,
          created_by: user?.id,
        });
      }

      return NextResponse.json({ submission: data });
    } else if (body.question_id) {
      // Update a bank question
      const { question_id, ...updates } = body;
      const { data, error } = await supabase
        .from('nexus_verified_questions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', question_id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ question: data });
    }

    return NextResponse.json({ error: 'Missing submission_id or question_id' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update';
    console.error('Questions PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

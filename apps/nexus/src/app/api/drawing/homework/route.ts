import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createDrawingHomework, getDrawingHomeworkList } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const role = ['teacher', 'admin'].includes(user.user_type ?? '') ? 'teacher' : 'student';
    const homework = await getDrawingHomeworkList(user.id, role as any);
    return NextResponse.json({ homework });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).single();
    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, question_ids, reference_images, assigned_to, student_ids, due_date, is_mandatory, classroom_id } = body;

    if (!title || !due_date || !assigned_to) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const homework = await createDrawingHomework({
      title,
      description: description || null,
      question_ids: question_ids || [],
      reference_images: reference_images || [],
      assigned_to,
      student_ids: student_ids || [],
      due_date,
      is_mandatory: is_mandatory || false,
      created_by: user.id,
      classroom_id: classroom_id || null,
    });

    return NextResponse.json({ homework }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

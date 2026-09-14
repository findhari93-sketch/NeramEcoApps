import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  enableQBForClassroom,
  disableQBForClassroom,
  isQBEnabledForClassroom,
  getUserRoleInClassroom,
} from '@neram/database';

import { describeError } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    // Students must be enrolled in the classroom to check QB status
    if (caller.user_type === 'student') {
      const role = await getUserRoleInClassroom(caller.id, classroomId);
      if (!role) {
        return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
      }
    }

    // Which exams have a published paper, so the student sidebar can leave an
    // exam out until there is something in it. Asked here because every student
    // page already makes this request at boot; a separate route would add one.
    const [enabled, { data: visiblePapers, error: visibleError }] = await Promise.all([
      isQBEnabledForClassroom(classroomId),
      // `as any`: the generated types predate is_student_visible (see qb-papers.ts).
      supabase
        .from('nexus_qb_original_papers' as any)
        .select('exam_type')
        .eq('is_student_visible', true),
    ]);
    if (visibleError) throw visibleError;
    const published_exams = Array.from(
      new Set(((visiblePapers ?? []) as unknown as { exam_type: string }[]).map((p) => p.exam_type)),
    );

    return NextResponse.json(
      { data: { enabled, is_active: enabled, published_exams } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { classroom_id } = body;

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    await enableQBForClassroom(classroom_id, caller.id);

    return NextResponse.json({ data: { enabled: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { classroom_id } = body;

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    await disableQBForClassroom(classroom_id);

    return NextResponse.json({ data: { enabled: false } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

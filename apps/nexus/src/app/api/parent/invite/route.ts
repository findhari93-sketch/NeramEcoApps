import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/parent/invite
 * Teacher generates a parent invite code for a student
 * Body: { classroom_id, student_id }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { classroom_id, student_id } = body;

    if (!classroom_id || !student_id) {
      return NextResponse.json({ error: 'Missing classroom_id or student_id' }, { status: 400 });
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

    // Verify teacher role
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', classroom_id)
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can generate invite codes' }, { status: 403 });
    }

    // Generate 6-digit invite code
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    const { data: invite, error } = await supabase
      .from('nexus_parent_invite_codes')
      .insert({
        classroom_id,
        student_id,
        invite_code: inviteCode,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate invite';
    console.error('Parent invite POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/parent/invite?code={code}
 * Look up an invite code (for parent redemption)
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: invite, error } = await supabase
      .from('nexus_parent_invite_codes')
      .select('*, student:users!nexus_parent_invite_codes_student_id_fkey(name), classroom:nexus_classrooms(name)')
      .eq('invite_code', code)
      .eq('is_active', true)
      .is('used_at', null)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invalid or expired invite code' }, { status: 404 });
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite code has expired' }, { status: 410 });
    }

    return NextResponse.json({
      student_name: (invite.student as any)?.name || 'Student',
      classroom_name: (invite.classroom as any)?.name || 'Classroom',
      expires_at: invite.expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to verify invite';
    console.error('Parent invite GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import { hashPassword } from '@/lib/parent-password';
import { buildParentMsOid, normalizeLoginId } from '@/lib/parent-credentials';
import { signParentToken } from '@/lib/parent-token';

/**
 * POST /api/auth/parent/test-login
 *
 * Test-only endpoint for E2E. Provisions a real parent user, a real credential
 * row and a real link to an existing student, then returns a real `par_` token.
 *
 * Deliberately NOT a fake. The previous parent test helper mapped 'parent' onto
 * the student account (tests/utils/auth-helpers.ts), so every parent assertion
 * in the suite was silently exercising a student session and passing for the
 * wrong reason. This endpoint takes the genuine path end to end, so a spec that
 * passes here proves the parent path actually works.
 *
 * The only thing it skips is typing the password into the form, which
 * parent-portal-nexus.spec.ts covers separately against the real login route.
 *
 * Blocked in production, exactly like /api/auth/test-login.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      studentEmail,
      studentId: requestedStudentId,
      loginId: requestedLoginId,
      password = 'e2e-parent-pass1',
      mustChangePassword = false,
      reset = true,
    } = body as {
      studentEmail?: string;
      studentId?: string;
      loginId?: string;
      password?: string;
      mustChangePassword?: boolean;
      reset?: boolean;
    };

    if (!studentEmail && !requestedStudentId) {
      return NextResponse.json(
        { error: 'studentEmail or studentId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: student } = requestedStudentId
      ? await supabase
          .from('users')
          .select('id, name')
          .eq('id', requestedStudentId)
          .maybeSingle()
      : await supabase
          .from('users')
          .select('id, name')
          .eq('email', studentEmail as string)
          .maybeSingle();

    if (!student) {
      return NextResponse.json(
        { error: `Student not found: ${requestedStudentId || studentEmail}` },
        { status: 404 }
      );
    }

    const loginId = normalizeLoginId(requestedLoginId) || `e2e.p${String(student.id).slice(0, 8)}`;

    // Reuse a stable parent per login id so repeated runs do not pile up rows
    // (the e2e test-account hygiene convention: stable + reset, never Date.now()).
    const { data: existingCred } = await supabase
      .from('nexus_parent_credentials')
      .select('id, parent_user_id')
      .eq('login_id', loginId)
      .maybeSingle();

    let parentUserId = existingCred?.parent_user_id ?? null;

    if (parentUserId && reset) {
      await supabase.from('nexus_parent_links').delete().eq('parent_user_id', parentUserId);
      await supabase.from('nexus_parent_credentials').delete().eq('parent_user_id', parentUserId);
      await supabase.from('users').delete().eq('id', parentUserId);
      parentUserId = null;
    }

    let msOid: string;

    if (!parentUserId) {
      msOid = buildParentMsOid(randomUUID());
      const { data: created, error: createError } = await supabase
        .from('users')
        .insert({
          name: `${student.name || 'Test'} (parent)`,
          // Parents have no email by default; a unique placeholder keeps the
          // column's uniqueness constraint happy without implying a real inbox.
          email: `${loginId}@e2e-parent.invalid`,
          ms_oid: msOid,
          user_type: 'parent',
          status: 'active',
          email_verified: false,
          phone_verified: false,
          preferred_language: 'en',
        })
        .select('id, ms_oid')
        .single();

      if (createError || !created) {
        return NextResponse.json(
          { error: 'Failed to create test parent', details: createError?.message },
          { status: 500 }
        );
      }
      parentUserId = created.id;
      msOid = created.ms_oid as string;
    } else {
      const { data: existingUser } = await supabase
        .from('users')
        .select('ms_oid')
        .eq('id', parentUserId)
        .single();
      msOid = (existingUser?.ms_oid as string) || buildParentMsOid(randomUUID());
    }

    const { data: cred, error: credError } = await supabase
      .from('nexus_parent_credentials')
      .upsert(
        {
          parent_user_id: parentUserId,
          login_id: loginId,
          password_hash: await hashPassword(password),
          must_change_password: mustChangePassword,
          is_active: true,
          token_version: 1,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: 'parent_user_id' }
      )
      .select('token_version')
      .single();

    if (credError || !cred) {
      return NextResponse.json(
        { error: 'Failed to create test parent credential', details: credError?.message },
        { status: 500 }
      );
    }

    // Link to the student's current classroom, if they are in one.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', student.id)
      .eq('role', 'student')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { error: linkError } = await supabase.from('nexus_parent_links').upsert(
      {
        parent_user_id: parentUserId,
        student_user_id: student.id,
        classroom_id: enrollment?.classroom_id ?? null,
        relationship: 'parent',
        is_primary: true,
        is_active: true,
        linked_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'parent_user_id,student_user_id' }
    );

    if (linkError) {
      return NextResponse.json(
        { error: 'Failed to link test parent to student', details: linkError.message },
        { status: 500 }
      );
    }

    const { token, expiresAt } = signParentToken({
      parentUserId: parentUserId as string,
      parentMsOid: msOid,
      tokenVersion: cred.token_version,
      mustChangePassword,
    });

    return NextResponse.json({
      token,
      expiresAt,
      loginId,
      password,
      mustChangePassword,
      parent: { id: parentUserId, name: `${student.name || 'Test'} (parent)` },
      children: [{ id: student.id, name: student.name }],
    });
  } catch (err) {
    console.error('Parent test-login error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Parent test login failed' },
      { status: 500 }
    );
  }
}

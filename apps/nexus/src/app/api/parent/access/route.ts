import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff, assertCapability } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { hashPassword } from '@/lib/parent-password';
import {
  generateLoginId,
  generateTempPassword,
  buildParentMsOid,
  normalizeContactEmail,
  normalizeContactPhone,
} from '@/lib/parent-credentials';

/**
 * Staff provisioning of parent logins.
 *
 * GET  /api/parent/access?classroom=  which students have parent access
 * POST /api/parent/access             create it for one student
 *
 * The temporary password is returned EXACTLY ONCE, in the POST response, and is
 * never stored in plaintext anywhere. Staff must copy it there and then; if they
 * lose it the only path is Regenerate. That is a deliberate cost: a recoverable
 * password would mean storing it reversibly.
 *
 * Node runtime required (crypto.scrypt).
 */

/** How many times to retry a login-id collision before giving up. */
const LOGIN_ID_ATTEMPTS = 5;

export async function GET(request: NextRequest) {
  try {
    // getRequestUser takes the FULL Authorization header, not the bare token:
    // it hands the value straight to verifyMsToken, which requires the
    // "Bearer " prefix. Passing extractBearerToken() here strips that prefix
    // and every staff call fails with "Missing or invalid Authorization header".
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // nexus_enrollments references users twice (user_id, removed_by), so the
    // embed must name the foreign key or PostgREST cannot disambiguate it.
    const { data: roster } = await supabase
      .from('nexus_enrollments')
      .select('user_id, student:users!nexus_enrollments_user_id_fkey(id, name, avatar_url)')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    const studentIds = (roster || []).map((r: any) => r.user_id);
    if (studentIds.length === 0) return NextResponse.json({ rows: [] });

    const { data: links } = await supabase
      .from('nexus_parent_links')
      .select('student_user_id, parent_user_id, is_active, revoked_at')
      .in('student_user_id', studentIds);

    const activeLinks = (links || []).filter(
      (l: any) => l.is_active === true && !l.revoked_at
    );

    const { data: creds } = activeLinks.length
      ? await supabase
          .from('nexus_parent_credentials')
          .select(
            'parent_user_id, login_id, last_login_at, is_active, must_change_password, contact_email, contact_phone'
          )
          .in(
            'parent_user_id',
            activeLinks.map((l: any) => l.parent_user_id)
          )
      : { data: [] as any[] };

    const credByParent = new Map((creds || []).map((c: any) => [c.parent_user_id, c]));
    const linkByStudent = new Map(activeLinks.map((l: any) => [l.student_user_id, l]));

    return NextResponse.json({
      rows: (roster || []).map((r: any) => {
        const link = linkByStudent.get(r.user_id);
        const cred = link ? credByParent.get(link.parent_user_id) : null;
        return {
          studentId: r.user_id,
          studentName: r.student?.name ?? null,
          avatarUrl: r.student?.avatar_url ?? null,
          parentUserId: link?.parent_user_id ?? null,
          loginId: cred?.login_id ?? null,
          lastLoginAt: cred?.last_login_at ?? null,
          isActive: cred?.is_active ?? false,
          mustChangePassword: cred?.must_change_password ?? false,
          contactEmail: cred?.contact_email ?? null,
          contactPhone: cred?.contact_phone ?? null,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err, 'Could not load parent access');
  }
}

export async function POST(request: NextRequest) {
  try {
    // getRequestUser takes the FULL Authorization header, not the bare token:
    // it hands the value straight to verifyMsToken, which requires the
    // "Bearer " prefix. Passing extractBearerToken() here strips that prefix
    // and every staff call fails with "Missing or invalid Authorization header".
    const user = await getRequestUser(request.headers.get('Authorization'));
    // Same authority question as "who may attach a person to a cohort", so it
    // reuses that capability rather than inventing a parallel one. Manager and
    // admin only.
    assertCapability(user, 'structure.enrollment.add');

    const body = await request.json().catch(() => ({}));
    const studentId = typeof body?.studentId === 'string' ? body.studentId : '';
    const relationship = ['parent', 'guardian', 'other'].includes(body?.relationship)
      ? body.relationship
      : 'parent';
    const parentName = typeof body?.parentName === 'string' ? body.parentName.trim() : '';
    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';

    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    // Reject a malformed contact detail rather than storing null for it. Both
    // fields are optional, so silently dropping a typo would look like success
    // and then never deliver anything.
    const contactEmail = normalizeContactEmail(rawEmail);
    if (rawEmail && !contactEmail) {
      throw new ApiError(
        'That email address does not look right. Check it, or leave it blank.',
        400
      );
    }
    const contactPhone = normalizeContactPhone(rawPhone);
    if (rawPhone && !contactPhone) {
      throw new ApiError(
        'That phone number does not look right. Check it, or leave it blank.',
        400
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: student } = await supabase
      .from('users')
      .select('id, name, is_alumni')
      .eq('id', studentId)
      .maybeSingle();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    if (student.is_alumni) {
      throw new ApiError(
        'This student has graduated, so parent access cannot be created.',
        400
      );
    }

    // One active parent login per student in Phase 1. A second guardian is a
    // Phase 5 feature and needs the is_primary rules to be exercised properly,
    // so refusing here is better than quietly creating an unreachable row.
    const { data: existingLink } = await supabase
      .from('nexus_parent_links')
      .select('id, parent_user_id')
      .eq('student_user_id', studentId)
      .eq('is_active', true)
      .is('revoked_at', null)
      .maybeSingle();

    if (existingLink) {
      throw new ApiError(
        'This student already has parent access. Use Regenerate password instead.',
        409
      );
    }

    const { data: classroom } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', studentId)
      .eq('role', 'student')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const displayName =
      parentName || `${(student.name || 'Student').split(' ')[0]}'s parent`;

    const msOid = buildParentMsOid(randomUUID());
    const { data: parentUser, error: parentError } = await supabase
      .from('users')
      .insert({
        name: displayName,
        // Email and phone are deliberately NOT written here. Both columns are
        // UNIQUE across all four apps, and a parent's address is usually
        // already on a lead row from the enquiry form they filled in months
        // ago, so writing it here fails with users_email_key on the most
        // ordinary input there is. They are a delivery address for the digest,
        // not an identity, so they live on nexus_parent_credentials below.
        ms_oid: msOid,
        user_type: 'parent',
        status: 'active',
        email_verified: false,
        phone_verified: false,
        preferred_language: 'en',
      })
      .select('id')
      .single();

    if (parentError || !parentUser) {
      // The only unique column set above is a freshly generated uuid, so a
      // constraint violation here means something unforeseen. Say so plainly
      // instead of putting a raw Postgres constraint name on a teacher's screen.
      if (parentError?.code === '23505') {
        throw new ApiError(
          'Could not create the parent account because it clashed with an existing record. Please try again.',
          409
        );
      }
      throw new Error(parentError?.message || 'Could not create the parent account');
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    let loginId = '';
    let credentialCreated = false;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < LOGIN_ID_ATTEMPTS; attempt++) {
      const candidate = generateLoginId(student.name);
      const { error } = await supabase.from('nexus_parent_credentials').insert({
        parent_user_id: parentUser.id,
        login_id: candidate,
        password_hash: passwordHash,
        must_change_password: true,
        is_active: true,
        created_by: user.id,
        // Not unique, unlike users.email/users.phone. Two guardians may share
        // an inbox, and a parent's number may already be recorded elsewhere.
        contact_email: contactEmail,
        contact_phone: contactPhone,
      });

      if (!error) {
        loginId = candidate;
        credentialCreated = true;
        break;
      }
      // 23505 is a unique violation, i.e. this login id is taken. Anything else
      // is a real failure and retrying will not help.
      if (error.code !== '23505') {
        lastError = error.message;
        break;
      }
    }

    if (!credentialCreated) {
      // Roll back the orphan parent user, or a failed provision leaves a
      // permanently unreachable account behind.
      await supabase.from('users').delete().eq('id', parentUser.id);
      throw new Error(
        lastError || 'Could not allocate a login ID. Please try again.'
      );
    }

    const { error: linkError } = await supabase.from('nexus_parent_links').insert({
      parent_user_id: parentUser.id,
      student_user_id: studentId,
      classroom_id: classroom?.classroom_id ?? null,
      relationship,
      is_primary: true,
      is_active: true,
      linked_at: new Date().toISOString(),
      created_by: user.id,
    });

    if (linkError) {
      await supabase.from('nexus_parent_credentials').delete().eq('parent_user_id', parentUser.id);
      await supabase.from('users').delete().eq('id', parentUser.id);
      throw new Error(linkError.message);
    }

    return NextResponse.json({
      parent: { id: parentUser.id, name: displayName },
      child: { id: student.id, name: student.name },
      loginId,
      // Shown once. Not stored, not retrievable, not logged.
      tempPassword,
      // Echoed back normalised, so staff can see that a bare 10-digit number
      // was stored as +91... rather than wondering whether it saved at all.
      contactEmail,
      contactPhone,
    });
  } catch (err) {
    return errorResponse(err, 'Could not create parent access');
  }
}

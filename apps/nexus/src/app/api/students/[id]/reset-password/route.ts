import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { resetStudentPassword } from '@/lib/student-account-provisioning';
import { generateTempPassword } from '@/lib/student-account-rules';
import { createResetPasswordPorts } from '@/lib/student-account-store';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * POST /api/students/[id]/reset-password
 *
 * A new temporary password for a student's Microsoft account, which they must
 * change when they next sign in. Students only: a staff account's password is
 * managed in Azure, never from a roster. The password is in this response once,
 * with no-store, and nowhere else.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'structure.student.account');

    const supabase = getSupabaseAdminClient() as any;
    const result = await resetStudentPassword(createResetPasswordPorts(supabase), {
      userId: id,
      password: generateTempPassword((max) => randomInt(max)),
      actorId: caller.id,
    });

    if (result.kind === 'reset') return NextResponse.json(result, { headers: NO_STORE });
    if (result.kind === 'conflict') {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers: NO_STORE });
    }
    return NextResponse.json(
      { error: result.error.message, fix: result.error.fix ?? null, code: result.error.code },
      { status: 502, headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not reset the password');
  }
}

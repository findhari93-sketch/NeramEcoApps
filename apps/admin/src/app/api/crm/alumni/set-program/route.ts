// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { bulkSetStudentProgram } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/set-program
 * Move students between the architecture and software programs. Used by the admin
 * "Move to Software course" (program='software') and "Move back to architecture
 * students" (program='architecture') actions. Moving to software also locks the
 * student out of Nexus (see bulkSetStudentProgram).
 * Body: { userIds: string[], program: 'architecture' | 'software', adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, program, adminId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (program !== 'architecture' && program !== 'software') {
      return NextResponse.json({ error: "program must be 'architecture' or 'software'." }, { status: 400 });
    }

    const result = await bulkSetStudentProgram(userIds, program, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni set-program error:', error);
    return NextResponse.json({ error: error.message || 'Failed to move students' }, { status: 500 });
  }
}

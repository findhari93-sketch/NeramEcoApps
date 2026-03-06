// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserExamDetails,
  getUserExamAuditLogs,
} from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const client = getSupabaseAdminClient();

    const [examDetails, auditLogs] = await Promise.all([
      getUserExamDetails(userId, client),
      getUserExamAuditLogs(userId, client),
    ]);

    return NextResponse.json({
      profile: examDetails.profile,
      attempts: examDetails.attempts,
      auditLogs,
    });
  } catch (err) {
    console.error('Error fetching user exam details:', err);
    return NextResponse.json(
      { error: 'Failed to fetch user exam details' },
      { status: 500 }
    );
  }
}

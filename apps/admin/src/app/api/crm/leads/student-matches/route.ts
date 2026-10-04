export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/crm/leads/student-matches
 * Returns leads whose email matches a student's email.
 *
 * The match runs in SQL (admin_lead_student_email_matches, migration
 * 20261026090000). It used to load every student email into the function and send
 * them all back in one `.in()` URL, which grows with the student count and fails
 * past a few hundred addresses. The SQL match also ignores case and spaces.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any).rpc('admin_lead_student_email_matches');
    if (error) throw error;
    return NextResponse.json({
      matchingUserIds: ((data || []) as Array<{ user_id: string }>).map((r) => r.user_id),
    });
  } catch (error: any) {
    console.error('Student matches error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to find student matches' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/crm/leads/student-matches
 * Returns leads whose email matches a student's email.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    // Get all student emails
    const { data: students, error: sErr } = await supabase
      .from('users')
      .select('email')
      .eq('user_type', 'student')
      .not('email', 'is', null);

    if (sErr) throw sErr;

    const studentEmails = (students || []).map((s) => s.email).filter(Boolean);

    if (studentEmails.length === 0) {
      return NextResponse.json({ matchingUserIds: [] });
    }

    // Find leads with matching emails
    const { data: matchingLeads, error: lErr } = await supabase
      .from('users')
      .select('id, email')
      .eq('user_type', 'lead')
      .in('email', studentEmails);

    if (lErr) throw lErr;

    return NextResponse.json({
      matchingUserIds: (matchingLeads || []).map((l) => l.id),
    });
  } catch (error: any) {
    console.error('Student matches error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to find student matches' },
      { status: 500 }
    );
  }
}

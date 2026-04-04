import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/nav-badges
 * Returns lightweight badge counts for sidebar navigation items.
 * Students: count of their own open+in_progress issues.
 * Teachers/Admins: count of all open+in_progress issues.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const badges: Record<string, number> = {};

    if (user.user_type === 'teacher' || user.user_type === 'admin') {
      // Count all open + in_progress issues
      const { count } = await supabase
        .from('nexus_foundation_issues')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']);

      badges.issues = count ?? 0;

      // Count pending onboarding reviews (submitted, not yet approved/rejected)
      const db = supabase as any;
      const { count: onboardingCount } = await db
        .from('nexus_student_onboarding')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');

      badges.onboarding = onboardingCount ?? 0;

      // Count pending drawing reviews (submitted, not yet reviewed)
      const { count: drawingCount } = await supabase
        .from('drawing_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');

      badges.drawing_reviews = drawingCount ?? 0;
    } else {
      // Student: count their own open + in_progress issues
      const { count } = await supabase
        .from('nexus_foundation_issues')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .in('status', ['open', 'in_progress']);

      badges.issues = count ?? 0;
    }

    return NextResponse.json({ badges });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load badges';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

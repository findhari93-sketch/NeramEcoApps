export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';
import { effectiveTier, istToday } from '@/lib/college-hub/plan';

/**
 * GET /api/college-dashboard/profile
 * The signed-in account, its college and the college's plan. Also records the
 * sign-in (last_login_at, and accepted_at the first time).
 * College edits go through /api/college-dashboard/content (staff review).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;

    const [collegeRes, planRes, lastPlanRes, pendingRes] = await Promise.all([
      db
        .from('colleges')
        .select('id, name, slug, state_slug, city, state, neram_tier, tier_start_date, tier_end_date, verified, logo_url')
        .eq('id', authUser.college_id)
        .single(),
      db.from('college_plans').select('tier, starts_on, ends_on, status').eq('college_id', authUser.college_id).eq('status', 'active').maybeSingle(),
      db
        .from('college_plans')
        .select('tier, starts_on, ends_on, status, revoked_at')
        .eq('college_id', authUser.college_id)
        .neq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1),
      db.from('college_content_submissions').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).eq('status', 'pending'),
    ]);
    if (collegeRes.error) throw collegeRes.error;
    const college = collegeRes.data;

    await db
      .from('college_admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', authUser.id);
    await db.from('college_admins').update({ accepted_at: new Date().toISOString() }).eq('id', authUser.id).is('accepted_at', null);

    const tier = effectiveTier(college);
    const active = planRes.data ?? null;
    const last = (lastPlanRes.data ?? [])[0] ?? null;
    return NextResponse.json({
      admin: { id: authUser.id, college_id: authUser.college_id, name: authUser.name, email: authUser.email, role: authUser.role },
      college: { ...college, neram_tier: tier },
      plan: {
        tier,
        active: active && tier !== 'free' ? active : null,
        upcoming: active && active.starts_on > istToday() ? active : null,
        last_ended: !active ? last : null,
      },
      pending_submissions: pendingRes.count ?? 0,
    });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export const dynamic = 'force-dynamic';

/**
 * GET  /api/college-hub/plans?status=all|active|expiring|ended|revoked&tier=silver|gold|platinum&expiring_within=30
 *      -> { plans: PlanListRow[], counts: { all, active, expiring, ended, revoked }, today }
 * POST /api/college-hub/plans { college_id, tier, starts_on?, ends_on, amount?, notes?, staff_name? }
 *      -> 201 { plan, revalidated }   | 409 when the college already has an active plan
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isPlanFilter, isPlanTier, validateGivePlan } from '@/lib/college-plans/helpers';
import { givePlan, listPlans, planErrorResponse } from '@/lib/college-plans/service';
import { revalidateCollegePage } from '@/lib/marketing-revalidate';
import { resolveStaff } from '@/lib/staff-actor';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = sp.get('status');
  const tier = sp.get('tier');
  const within = Number(sp.get('expiring_within'));
  try {
    const result = await listPlans({
      status: isPlanFilter(status) ? status : 'all',
      tier: isPlanTier(tier) ? tier : null,
      expiringWithinDays: Number.isFinite(within) && within > 0 ? Math.min(within, 365) : undefined,
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (err) {
    const { status: code, error } = planErrorResponse(err);
    return NextResponse.json({ error }, { status: code });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateGivePlan(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const staff = await resolveStaff(request, body);
  try {
    const plan = await givePlan({ ...checked.value, staff: staff.name });
    const revalidated = await revalidateCollegePage(plan.college ?? { state_slug: null, slug: null }, {
      adminOrigin: request.nextUrl.origin,
    });
    return NextResponse.json({ plan, revalidated }, { status: 201, headers: noStore });
  } catch (err) {
    const { status, error } = planErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}

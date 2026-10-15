export const dynamic = 'force-dynamic';

/**
 * PATCH /api/college-hub/plans/:id
 *   { action: 'extend', ends_on: 'YYYY-MM-DD' }
 *   { action: 'change_tier', tier: 'silver' | 'gold' | 'platinum' }
 *   { action: 'revoke', reason: string }
 * -> { plan, revalidated }. 409 when the plan is no longer active.
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { changeTier, extendPlan, planErrorResponse, revokePlan } from '@/lib/college-plans/service';
import type { PlanTier } from '@/lib/college-plans/helpers';
import { revalidateCollegePage } from '@/lib/marketing-revalidate';
import { resolveStaff } from '@/lib/staff-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    let plan;
    if (action === 'extend') {
      plan = await extendPlan(params.id, String(body?.ends_on ?? ''));
    } else if (action === 'change_tier') {
      plan = await changeTier(params.id, body?.tier as PlanTier);
    } else if (action === 'revoke') {
      const staff = await resolveStaff(request, body);
      plan = await revokePlan(params.id, String(body?.reason ?? ''), staff.name);
    } else {
      return NextResponse.json({ error: "action must be 'extend', 'change_tier' or 'revoke'" }, { status: 400 });
    }
    // Extending changes only dates the page does not show, but the tier end date
    // feeds the dashboard, so refresh on every change.
    const revalidated = await revalidateCollegePage(plan.college ?? { state_slug: null, slug: null }, {
      adminOrigin: request.nextUrl.origin,
    });
    return NextResponse.json({ plan, revalidated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const { status, error } = planErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }
}

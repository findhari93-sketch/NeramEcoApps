import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { isPlanTier, presetEndDate, todayIST } from '@/lib/college-plans/helpers';
import { givePlan, planErrorResponse, revokeActivePlanFor } from '@/lib/college-plans/service';
import { revalidateCollegePage } from '@/lib/marketing-revalidate';
import { resolveStaff } from '@/lib/staff-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TIERS = ['free', 'silver', 'gold', 'platinum'] as const;
type Tier = (typeof VALID_TIERS)[number];

const REASON = 'Changed from outreach';

/**
 * PATCH /api/college-outreach/tier { college_id, tier, tier_amount? }
 *
 * Goes through college plans (Admin > College Hub > Plans) so every change has
 * history: a paid tier revokes any active plan and gives a one-year plan from
 * today; 'free' revokes the active plan. The trigger on college_plans updates
 * colleges.neram_tier. Response shape is unchanged: { success, college }.
 */
export async function PATCH(req: NextRequest) {
  let body: { college_id?: string; tier?: Tier; tier_amount?: number; staff_name?: string; staff_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  if (!body.tier || !(VALID_TIERS as readonly string[]).includes(body.tier)) {
    return NextResponse.json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }

  const staff = await resolveStaff(req, body as Record<string, unknown>);
  try {
    await revokeActivePlanFor(body.college_id, REASON, staff.name);
    if (isPlanTier(body.tier)) {
      const today = todayIST();
      const amount = typeof body.tier_amount === 'number' && body.tier_amount >= 0 ? body.tier_amount : 0;
      await givePlan({
        college_id: body.college_id,
        tier: body.tier,
        starts_on: today,
        ends_on: presetEndDate('year', today),
        amount,
        notes: REASON,
        staff: staff.name,
      });
    }
  } catch (err) {
    const { status, error } = planErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }

  const { data, error } = await (getSupabaseAdminClient().from('colleges' as never) as any)
    .select('id, name, slug, state_slug, neram_tier, tier_start_date, tier_end_date, tier_amount')
    .eq('id', body.college_id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { slug, state_slug, ...college } = data as Record<string, unknown>;
  await revalidateCollegePage({ slug: slug as string, state_slug: state_slug as string }, { adminOrigin: req.nextUrl.origin });
  return NextResponse.json({ success: true, college });
}

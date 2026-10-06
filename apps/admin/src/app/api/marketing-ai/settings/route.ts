export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing-ai/settings  autonomy, targets, guardrails and each
 *                                 category's approval record
 * PUT /api/marketing-ai/settings  { autonomy?, targets?, guardrails?, profile? }
 *
 * Safe categories (SAFE_AUTO) can be automatic from day one; any other
 * category only once it has earned it (see ELIGIBILITY in autopilot.ts).
 * Values are clamped to HARD_LIMITS. Every save is audited with before and
 * after. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { categoryEligibility, ELIGIBILITY } from '@/lib/marketing-ai/autopilot';
import { writeAudit } from '@/lib/marketing-ai/audit';
import { HARD_LIMITS, resolveSettings, SAFE_AUTO } from '@/lib/marketing-ai/config';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse, readJson } from '@/lib/marketing-ai/http';
import { db, loadSettings, saveSettings } from '@/lib/marketing-ai/store';
import type { ExecutableCategory } from '@/lib/marketing-ai/types';

async function eligibility(client: any) {
  const { data, error } = await client
    .from('marketing_ai_recommendations')
    .select('category, status, decided_by')
    .in('status', ['approved', 'rejected', 'executing', 'executed', 'failed', 'measured'])
    .limit(5000);
  if (error) throw new Error(error.message);
  return categoryEligibility(data ?? []);
}

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    return NextResponse.json({ settings: await loadSettings(client), eligibility: await eligibility(client), rules: { ELIGIBILITY, HARD_LIMITS, SAFE_AUTO } });
  } catch (err) {
    return errorResponse(err, 'settings');
  }
}

export async function PUT(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const body = await readJson(request);
    const before = await loadSettings(client);
    const next = resolveSettings({
      autonomy: { ...before.autonomy, ...body.autonomy, categories: { ...before.autonomy.categories, ...body.autonomy?.categories } },
      targets: { ...before.targets, ...body.targets, season: { ...before.targets.season, ...body.targets?.season } },
      guardrails: { ...before.guardrails, ...body.guardrails },
      profile: { ...before.profile, ...body.profile, landing_pages: { ...before.profile.landing_pages, ...body.profile?.landing_pages } },
    });

    const elig = await eligibility(client);
    for (const cat of Object.keys(next.autonomy.categories) as ExecutableCategory[]) {
      const turningOn = next.autonomy.categories[cat] === 'auto' && before.autonomy.categories[cat] !== 'auto';
      const e = elig.find((x) => x.category === cat);
      if (turningOn && !SAFE_AUTO.includes(cat) && !e?.eligible) {
        return NextResponse.json(
          { error: `"${cat.replace('_', ' ')}" has not earned automatic mode yet: it needs ${ELIGIBILITY.minDecided} decided recommendations with ${ELIGIBILITY.minApprovalRate * 100}% approved (now ${e?.decided ?? 0} decided).` },
          { status: 409 },
        );
      }
    }

    await saveSettings(client, next, guard.adminId);
    await writeAudit(client, { actor: { type: 'admin', id: guard.adminId }, event: 'settings.updated', entityType: 'settings', entityId: 'marketing_ai', before, after: next });
    return NextResponse.json({ settings: next, eligibility: elig });
  } catch (err) {
    return errorResponse(err, 'settings update');
  }
}

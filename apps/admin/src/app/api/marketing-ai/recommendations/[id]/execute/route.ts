export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/marketing-ai/recommendations/:id/execute
 * Runs an approved (or failed, to retry) recommendation against Google Ads.
 * See lib/marketing-ai/actions.ts for the checks. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeRecommendation } from '@/lib/marketing-ai/actions';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { agentContext } from '@/lib/marketing-ai/pipeline';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const ctx = await agentContext();
    const outcome = await executeRecommendation({ ...ctx, actor: { type: 'admin', id: guard.adminId } }, params.id);
    return NextResponse.json(outcome, { status: outcome.status === 'failed' ? 502 : 200 });
  } catch (err) {
    return errorResponse(err, 'execute');
  }
}

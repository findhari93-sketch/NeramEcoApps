export const dynamic = 'force-dynamic';

/** GET /api/marketing-ai/recommendations/:id - The recommendation, its actions and its audit trail. Admins only. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { getRecommendation } from '@/lib/marketing-ai/recommendations';
import { db } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const rec = await getRecommendation(client, params.id);
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [{ data: actions }, { data: audit }] = await Promise.all([
      client.from('marketing_ai_actions').select('id, operation, status, actor, validate_only, error, created_at, finished_at, reverted_by_action_id, revert_payload').eq('recommendation_id', rec.id).order('created_at', { ascending: true }),
      client.from('marketing_ai_audit_log').select('id, actor, actor_type, event, reason, result, before, after, created_at').eq('recommendation_id', rec.id).order('created_at', { ascending: true }),
    ]);
    return NextResponse.json({
      recommendation: rec,
      actions: (actions ?? []).map((a: any) => ({ ...a, can_undo: a.status === 'succeeded' && !a.reverted_by_action_id && !!a.revert_payload, revert_payload: undefined })),
      audit: audit ?? [],
    });
  } catch (err) {
    return errorResponse(err, 'recommendation');
  }
}

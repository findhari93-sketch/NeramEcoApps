export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing-ai/recommendations?status=pending_approval&category=&priority=
 * status may be a comma list, or 'open' / 'done' / 'all'. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readAdsEnv } from '@/lib/marketing-ai/config';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { db } from '@/lib/marketing-ai/store';

const GROUPS: Record<string, string[]> = {
  pending: ['pending_approval'],
  progress: ['approved', 'executing', 'failed'],
  open: ['pending_approval', 'approved', 'executing', 'failed'],
  done: ['executed', 'measured', 'rejected', 'expired'],
};

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const params = new URL(request.url).searchParams;
    const statusParam = params.get('status') || 'open';
    const statuses = GROUPS[statusParam] ?? (statusParam === 'all' ? null : statusParam.split(',').filter(Boolean));

    let q = db()
      .from('marketing_ai_recommendations')
      .select('id, rule_id, category, entity_type, entity_id, campaign_id, title, reason, priority, risk_level, estimated_impact, status, ai_intent, confidence, decided_by, decided_at, executed_at, created_at, updated_at, evidence, ai_assessment, proposed_change')
      .order('created_at', { ascending: false })
      .limit(300);
    if (statuses) q = q.in('status', statuses);
    if (params.get('category')) q = q.eq('category', params.get('category'));
    if (params.get('priority')) q = q.eq('priority', params.get('priority'));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const items = (data ?? []).sort((a: any, b: any) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.created_at.localeCompare(a.created_at));
    const env = readAdsEnv();
    return NextResponse.json({ items, connection: { mode: env.mode, mutationsAllowed: env.allowMutations } });
  } catch (err) {
    return errorResponse(err, 'recommendations');
  }
}

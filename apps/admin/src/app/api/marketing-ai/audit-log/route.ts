export const dynamic = 'force-dynamic';

/** GET /api/marketing-ai/audit-log?limit=100&offset=0&actor_type=&event= - Newest first. Admins only. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { db } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const params = new URL(request.url).searchParams;
    const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100));
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    const client = db();
    let q = client.from('marketing_ai_audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (['admin', 'autopilot', 'cron'].includes(params.get('actor_type') || '')) q = q.eq('actor_type', params.get('actor_type'));
    if (params.get('event')) q = q.ilike('event', `${params.get('event')}%`);
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);

    // Show names, not ids, for the admins who acted.
    const ids = [...new Set((data ?? []).filter((r: any) => r.actor_type === 'admin').map((r: any) => r.actor))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: users } = await client.from('users').select('id, name, email').in('id', ids);
      for (const u of users ?? []) names[u.id] = u.name || u.email;
    }
    return NextResponse.json({ items: (data ?? []).map((r: any) => ({ ...r, actor_name: names[r.actor] ?? null })), total: count ?? 0 });
  } catch (err) {
    return errorResponse(err, 'audit log');
  }
}

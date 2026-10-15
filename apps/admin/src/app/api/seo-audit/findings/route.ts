export const dynamic = 'force-dynamic';

/**
 * GET   /api/seo-audit/findings?status=open&category=&severity= - the findings list.
 * PATCH /api/seo-audit/findings { id, action: 'ignore' | 'reopen', note? }
 *
 * Ignore is for findings that are intended (a page that should stay noindex).
 * An ignored finding reopens by itself if its substance changes. Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { db, selectAll } from '@/lib/seo-audit/store';

const STATUSES = ['open', 'waiting', 'fixed', 'ignored'];
const CATEGORIES = ['indexing', 'performance', 'onsite', 'aeo'];
const SEVERITIES = ['critical', 'high', 'medium', 'info'];
const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };

export async function GET(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const params = new URL(request.url).searchParams;
    const status = STATUSES.includes(params.get('status') || '') ? params.get('status')! : 'open';
    const category = params.get('category');
    const severity = params.get('severity');
    const client = db();
    const rows = await selectAll<any>((a, b) => {
      let q = client
        .from('seo_findings')
        .select('id, rule_id, category, severity, url, title, detail, status, first_seen, last_seen, resolved_at, ignore_note')
        .eq('status', status);
      if (category && CATEGORIES.includes(category)) q = q.eq('category', category);
      if (severity && SEVERITIES.includes(severity)) q = q.eq('severity', severity);
      // "issues": everything but info, the default view of the Issues tab.
      else if (severity === 'issues') q = q.neq('severity', 'info');
      return q.order('id').range(a, b);
    });
    rows.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (b.last_seen > a.last_seen ? 1 : b.last_seen < a.last_seen ? -1 : 0));
    return NextResponse.json({ findings: rows });
  } catch (err) {
    return seoError(err, 'findings');
  }
}

export async function PATCH(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    const action = body.action;
    if (!id || !['ignore', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'Send an id and an action of ignore or reopen.' }, { status: 400 });
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const update =
      action === 'ignore'
        ? { status: 'ignored', ignored_by: guard.adminId, ignore_note: note || null }
        : { status: 'open', ignored_by: null, ignore_note: null, resolved_at: null };
    const { data, error } = await db().from('seo_findings').update(update).eq('id', id).select('id, status').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Finding not found.' }, { status: 404 });
    return NextResponse.json({ finding: data });
  } catch (err) {
    return seoError(err, 'findings update');
  }
}

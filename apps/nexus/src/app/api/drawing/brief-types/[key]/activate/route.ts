/**
 * Switch a brief type on or off for AI evaluation. Admins only.
 *
 * POST { active: true } refuses, with every reason, while any band description
 * is a placeholder or fewer than five reference sheets are set. This is the
 * activateBriefType() that seed-criteria.ts always referred to.
 *
 * Switching ON spends nothing. It only makes the brief evaluable; whether any
 * evaluation actually runs is still the separate AI usage switch, which ships
 * off.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDrawingStaff, isNotMigrated } from '@/lib/drawing-staff-auth';
import { loadAnchorBands, loadBriefByKey, loadBriefCriteria } from '@/lib/drawing-brief-server';
import { briefReadiness } from '@/lib/drawing-brief-readiness';

export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireDrawingStaff(request);
    if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Only an admin can switch a brief type on' }, { status: 403 });
    }
    const { key } = await params;
    const supabase = auth.supabase;
    const body = (await request.json().catch(() => ({}))) as { active?: unknown };
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'Say active true or false' }, { status: 400 });

    const brief = await loadBriefByKey(supabase, decodeURIComponent(key));
    if (!brief) return NextResponse.json({ error: 'Brief type not found' }, { status: 404 });

    if (body.active) {
      const [criteria, anchors] = await Promise.all([loadBriefCriteria(supabase, [brief.id]), loadAnchorBands(supabase, [brief.id])]);
      const readiness = briefReadiness(criteria, anchors.get(brief.id) ?? []);
      if (!readiness.ready) {
        return NextResponse.json(
          { error: `${brief.title} is not ready to switch on.`, blockers: readiness.blockers, readiness },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase
      .from('drawing_brief_type')
      .update(body.active
        ? { is_active: true, activated_at: new Date().toISOString(), activated_by: auth.user.id }
        : { is_active: false })
      .eq('id', brief.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, is_active: body.active });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not change the brief type';
    if (isNotMigrated(message)) {
      return NextResponse.json({ error: 'Drawing evaluation is not migrated here', detail: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

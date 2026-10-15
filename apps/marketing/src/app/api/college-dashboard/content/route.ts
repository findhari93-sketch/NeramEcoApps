export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, requireCollegeAction, verifyCollegeDashboardAuth, DashboardError } from '@/lib/college-dashboard/auth';
import { isSection, SECTIONS } from '@/lib/college-dashboard/content-sections';
import { loadLiveSections } from '@/lib/college-dashboard/content-data';
import { saveSectionForReview } from '@/lib/college-dashboard/submissions';

/**
 * GET    /api/college-dashboard/content            live values + pending/last decision per section
 * POST   /api/college-dashboard/content {section, values}   send a section for staff review
 * DELETE /api/college-dashboard/content?section=x  withdraw the pending edit
 *
 * Nothing here changes the public page. Staff approve in Admin > College Hub >
 * Content reviews, which writes the live tables.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;
    const [{ college, sections }, subsRes] = await Promise.all([
      loadLiveSections(db, user.college_id),
      db
        .from('college_content_submissions')
        .select('id, section, payload, status, submitted_by_name, submitted_at, reviewed_at, review_note')
        .eq('college_id', user.college_id)
        .order('submitted_at', { ascending: false })
        .limit(60),
    ]);
    const subs = (subsRes.data ?? []) as Array<Record<string, any>>;
    const provided = (college.college_provided ?? {}) as Record<string, string>;

    const out: Record<string, unknown> = {};
    for (const s of SECTIONS) {
      const mine = subs.filter((r) => r.section === s.key);
      out[s.key] = {
        live: sections[s.key],
        pending: mine.find((r) => r.status === 'pending') ?? null,
        last_decision: mine.find((r) => r.status === 'approved' || r.status === 'rejected') ?? null,
        approved_at: provided[s.key] ?? null,
      };
    }
    return NextResponse.json({
      sections: out,
      college: { id: college.id, name: college.name, slug: college.slug, state_slug: college.state_slug },
    });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'edit_content');
    const body = (await request.json().catch(() => null)) as { section?: unknown; values?: unknown } | null;
    if (!body || !isSection(body.section) || typeof body.values !== 'object' || !body.values) {
      throw new DashboardError(400, 'Send a section and its values.');
    }
    const db = createAdminClient() as any;
    const { sections } = await loadLiveSections(db, user.college_id);
    const saved = await saveSectionForReview(db, user.college_id, body.section, body.values as Record<string, unknown>, sections[body.section], {
      adminId: user.id,
      name: user.name,
      source: 'dashboard',
    });
    if (!saved.ok && saved.kind === 'invalid') return NextResponse.json({ error: 'Some fields need a fix.', fields: saved.errors }, { status: 422 });
    if (!saved.ok) return NextResponse.json({ error: 'Nothing has changed from what is live now.' }, { status: 422 });
    return NextResponse.json({ success: true, id: saved.id, submitted_at: saved.submitted_at, changed: saved.changed });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'edit_content');
    const section = request.nextUrl.searchParams.get('section');
    if (!isSection(section)) throw new DashboardError(400, 'Unknown section.');
    const db = createAdminClient() as any;
    const { error } = await db
      .from('college_content_submissions')
      .update({ status: 'withdrawn', reviewed_at: new Date().toISOString(), reviewed_by: user.name })
      .eq('college_id', user.college_id)
      .eq('section', section)
      .eq('status', 'pending');
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

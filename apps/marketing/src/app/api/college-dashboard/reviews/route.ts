export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, requireCollegeAction, verifyCollegeDashboardAuth, DashboardError } from '@/lib/college-dashboard/auth';
import { revalidateCollegePage } from '@/lib/college-dashboard/revalidate';

/**
 * GET   /api/college-dashboard/reviews   published student reviews of this college
 * PATCH /api/college-dashboard/reviews   {id, reply}: one public reply per review ('' removes it)
 *
 * Colleges can reply, never edit or hide a review. Staff can still remove a
 * reply in Admin > College Hub > Reviews.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('college_reviews')
      .select('id, reviewer_name, reviewer_year, rating_overall, title, body, pros, cons, created_at, college_reply, college_reply_at, college_reply_by')
      .eq('college_id', user.college_id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'reply_reviews');
    const body = (await request.json().catch(() => ({}))) as { id?: string; reply?: string };
    if (!body.id || typeof body.reply !== 'string') throw new DashboardError(400, 'Write a reply.');
    const reply = body.reply.trim();
    if (reply.length > 1500) throw new DashboardError(400, 'Keep the reply under 1500 characters.');

    const db = createAdminClient() as any;
    const { data: review } = await db.from('college_reviews').select('college_id, status').eq('id', body.id).maybeSingle();
    if (!review || review.college_id !== user.college_id || review.status !== 'approved') throw new DashboardError(404, 'Review not found.');

    const { error } = await db
      .from('college_reviews')
      .update({
        college_reply: reply || null,
        college_reply_at: reply ? new Date().toISOString() : null,
        college_reply_by: reply ? user.name : null,
      })
      .eq('id', body.id);
    if (error) throw error;

    const { data: college } = await db.from('colleges').select('slug, state_slug').eq('id', user.college_id).single();
    if (college) revalidateCollegePage(college.state_slug, college.slug);
    return NextResponse.json({ success: true });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

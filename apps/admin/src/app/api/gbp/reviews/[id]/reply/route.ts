export const dynamic = 'force-dynamic';

/**
 * POST /api/gbp/reviews/[id]/reply  { comment, save_only? }
 *
 * Posts the owner reply to Google (reviews.updateReply) and records it. With
 * save_only, or while the API is not connected, it saves the text as a draft so
 * staff can paste it into Google by hand. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { stripDashes } from '@/lib/gbp/core';
import { NOT_CONNECTED_MESSAGE, getGbpClient } from '@/lib/gbp/server';
import { getRequestAdminId } from '@/lib/request-admin';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const comment = typeof body.comment === 'string' ? stripDashes(body.comment).trim() : '';
  if (comment.length < 5 || comment.length > 4000) {
    return NextResponse.json({ error: 'Write a reply between 5 and 4,000 characters.' }, { status: 400 });
  }
  const supabase = getSupabaseAdminClient() as any;
  const { data: review, error } = await supabase.from('gbp_reviews').select('id, google_review_name').eq('id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!review) return NextResponse.json({ error: 'This review no longer exists.' }, { status: 404 });

  if (body.save_only === true) {
    await supabase.from('gbp_reviews').update({ reply_draft: comment, reply_drafted_at: new Date().toISOString() }).eq('id', review.id);
    return NextResponse.json({ saved: true });
  }

  const gbp = getGbpClient();
  if ('missing' in gbp) {
    await supabase.from('gbp_reviews').update({ reply_draft: comment, reply_drafted_at: new Date().toISOString() }).eq('id', review.id);
    return NextResponse.json({ error: NOT_CONNECTED_MESSAGE, saved: true }, { status: 409 });
  }

  try {
    const reply = await gbp.client.updateReply(review.google_review_name, comment);
    await supabase
      .from('gbp_reviews')
      .update({
        reply_comment: reply.comment || comment,
        reply_update_time: reply.updateTime || new Date().toISOString(),
        reply_posted_by: getRequestAdminId(request),
        reply_draft: null,
      })
      .eq('id', review.id);
    return NextResponse.json({ posted: true });
  } catch (e: any) {
    console.error('[gbp] reply', e?.message || e);
    return NextResponse.json({ error: `Google did not accept the reply: ${e?.message || 'unknown error'}` }, { status: UPSTREAM_FAILED });
  }
}

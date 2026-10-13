export const dynamic = 'force-dynamic';

/**
 * GET  /api/gbp/posts  published, verified reviews that could become a success
 *      post on the centre's Google profile, plus posts already made.
 * POST /api/gbp/posts  { testimonialId, summary, publish }  save the post, and
 *      with publish (and the API connected) post it to Google as an Update.
 *
 * These are business posts, not reviews: posting them ourselves is allowed.
 * Online students' posts go to headquarters. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { stripDashes, successPostText } from '@/lib/gbp/core';
import { NOT_CONNECTED_MESSAGE, getGbpClient } from '@/lib/gbp/server';
import { getRequestAdminId } from '@/lib/request-admin';

const noStore = { 'Cache-Control': 'no-store' };
const EXAM: Record<string, string> = { NATA: 'NATA', JEE_PAPER_2: 'JEE Paper 2', BOTH: 'NATA and JEE Paper 2' };

async function centres(supabase: any) {
  const { data } = await supabase.from('offline_centers').select('id, name, city, center_type, gbp_location_name').eq('is_active', true);
  return (data || []) as Array<{ id: string; name: string; city: string; center_type: string; gbp_location_name: string | null }>;
}

/** The centre a post belongs on: the student's own, or headquarters for online students. */
function postCentre(t: { center_id: string | null; learning_mode: string | null }, all: Awaited<ReturnType<typeof centres>>) {
  const hq = all.find((c) => c.center_type === 'headquarters') || null;
  if (t.learning_mode === 'online') return hq;
  return all.find((c) => c.id === t.center_id) || hq;
}

export async function GET() {
  const supabase = getSupabaseAdminClient() as any;
  try {
    const [{ data: rows, error }, { data: posts }, all] = await Promise.all([
      supabase
        .from('testimonials')
        .select('id, student_name, consent_display_name, exam_type, year, rank, percentile, college_admitted, center_id, learning_mode, moderated_at')
        .eq('publication_status', 'published')
        .eq('is_verified_student', true)
        .order('moderated_at', { ascending: false })
        .limit(100),
      supabase.from('gbp_local_posts').select('*').order('created_at', { ascending: false }).limit(100),
      centres(supabase),
    ]);
    if (error) throw error;
    const posted = new Set(((posts || []) as any[]).map((p) => p.testimonial_id));
    const candidates = ((rows || []) as any[])
      .filter((t) => !posted.has(t.id))
      .map((t) => {
        const centre = postCentre(t, all);
        const firstName = String(t.consent_display_name || t.student_name || '').trim().split(/\s+/)[0] || 'Our student';
        return {
          testimonial_id: t.id,
          student_name: t.consent_display_name || t.student_name,
          centre_id: centre?.id ?? null,
          centre_name: centre?.name ?? null,
          can_publish: Boolean(centre?.gbp_location_name),
          summary: successPostText({
            firstName,
            examLabel: EXAM[t.exam_type] || 'NATA',
            year: t.year,
            rank: t.rank,
            percentile: t.percentile,
            college: t.college_admitted,
            centreCity: t.learning_mode === 'online' ? null : centre?.city ?? null,
            online: t.learning_mode === 'online',
          }),
        };
      });
    return NextResponse.json({ candidates, posts: posts || [], connected: !('missing' in getGbpClient()) }, { headers: noStore });
  } catch (e: any) {
    console.error('[gbp] posts list', e?.message || e);
    return NextResponse.json({ error: 'Could not load success posts.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const summary = typeof body.summary === 'string' ? stripDashes(body.summary).trim() : '';
  if (summary.length < 20 || summary.length > 1500) {
    return NextResponse.json({ error: 'A post is 20 to 1,500 characters.' }, { status: 400 });
  }
  const supabase = getSupabaseAdminClient() as any;
  const { data: t, error } = await supabase
    .from('testimonials')
    .select('id, center_id, learning_mode, publication_status, is_verified_student')
    .eq('id', body.testimonialId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!t || t.publication_status !== 'published') return NextResponse.json({ error: 'Only a published review can become a post.' }, { status: 409 });
  const centre = postCentre(t, await centres(supabase));

  const { data: post, error: insertError } = await supabase
    .from('gbp_local_posts')
    .insert({ center_id: centre?.id ?? null, testimonial_id: t.id, summary, status: 'draft', created_by: getRequestAdminId(request) })
    .select('*')
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  if (body.publish !== true) return NextResponse.json({ post });

  const gbp = getGbpClient();
  if ('missing' in gbp) return NextResponse.json({ post, error: NOT_CONNECTED_MESSAGE }, { status: 409 });
  if (!centre?.gbp_location_name) {
    return NextResponse.json({ post, error: 'This centre is not linked to a Google profile yet. Run a sync after adding its Place ID.' }, { status: 409 });
  }
  try {
    const made = await gbp.client.createLocalPost(centre.gbp_location_name, summary, 'https://neramclasses.com/reviews');
    const { data: done } = await supabase
      .from('gbp_local_posts')
      .update({ status: 'posted', google_post_name: made.name, posted_at: new Date().toISOString() })
      .eq('id', post.id)
      .select('*')
      .single();
    return NextResponse.json({ post: done });
  } catch (e: any) {
    await supabase.from('gbp_local_posts').update({ status: 'failed', error: String(e?.message || e).slice(0, 500) }).eq('id', post.id);
    return NextResponse.json({ error: `Google did not accept the post: ${e?.message || 'unknown error'}` }, { status: 502 });
  }
}

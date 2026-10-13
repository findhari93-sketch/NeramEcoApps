export const dynamic = 'force-dynamic';

/**
 * POST /api/gbp/reviews/[id]/draft  an AI draft of the owner reply.
 * Saved as reply_draft so another staff member sees it; never posted from here.
 * When AI is blocked: 409 with the prompt to run by hand.
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { AiBlockedError, generateGeminiText } from '@neram/ai';
import { buildReplyInstruction, stripDashes } from '@/lib/gbp/core';
import { getRequestAdminId } from '@/lib/request-admin';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdminClient() as any;
  const { data: review, error } = await supabase
    .from('gbp_reviews')
    .select('id, reviewer_name, star_rating, comment, center:offline_centers(city)')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!review) return NextResponse.json({ error: 'This review no longer exists.' }, { status: 404 });

  try {
    const raw = await generateGeminiText({
      feature: 'admin.gbp-reply',
      actorId: getRequestAdminId(request),
      systemInstruction: buildReplyInstruction({ stars: review.star_rating, centreCity: review.center?.city ?? null }),
      parts: [
        {
          text: `Reviewer: ${review.reviewer_name || 'A Google user'}\nStars: ${review.star_rating ?? 'not given'}\nReview: """${(review.comment || '(no text, stars only)').slice(0, 2000)}"""`,
        },
      ],
      responseMimeType: 'text/plain',
      temperature: 0.5,
      maxOutputTokens: 400,
    });
    const draft = stripDashes(raw).slice(0, 1000);
    await supabase.from('gbp_reviews').update({ reply_draft: draft, reply_drafted_at: new Date().toISOString() }).eq('id', review.id);
    return NextResponse.json({ draft });
  } catch (e: any) {
    if (e instanceof AiBlockedError) return NextResponse.json({ error: e.message, manualPrompt: e.manualPrompt }, { status: 409 });
    console.error('[gbp] draft', e?.message || e);
    return NextResponse.json({ error: 'Could not draft a reply. You can write one by hand.' }, { status: 500 });
  }
}

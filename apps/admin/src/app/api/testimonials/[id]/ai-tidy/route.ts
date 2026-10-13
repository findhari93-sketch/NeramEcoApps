export const dynamic = 'force-dynamic';

/**
 * POST /api/testimonials/[id]/ai-tidy  { text }
 *
 * A suggested tidy of a student review for staff to accept or ignore. Nothing is
 * saved here: staff read it, edit it and press Save. Uses the same rules as the
 * student's own compose step (@neram/ai review-compose), so AI never adds a fact
 * staff have not verified.
 *
 * Staff only (admin API middleware). When AI is blocked, answers 409 with the
 * prompt so staff can run it by hand.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  AiBlockedError,
  REVIEW_COMPOSE_SCHEMA,
  buildReviewComposeInstruction,
  generateGemini,
  parseComposedReview,
} from '@neram/ai';
import { getRequestAdminId } from '@/lib/request-admin';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 10) return NextResponse.json({ error: 'There is not enough text to tidy.' }, { status: 400 });

  try {
    const { data: t } = await (getSupabaseAdminClient().from('testimonials' as never) as any)
      .select('exam_type, year, rank, percentile, college_admitted, city, learning_mode')
      .eq('id', params.id)
      .maybeSingle();
    if (!t) return NextResponse.json({ error: 'This review no longer exists.' }, { status: 404 });

    const result = await generateGemini({
      feature: 'admin.review-edit',
      actorId: adminId,
      systemInstruction: buildReviewComposeInstruction(
        {
          examType: t.exam_type === 'JEE_PAPER_2' || t.exam_type === 'BOTH' ? t.exam_type : 'NATA',
          examYear: t.year,
          airRank: t.rank,
          percentile: t.percentile,
          collegeAdmitted: t.college_admitted,
          centreCity: t.city,
          learningMode: t.learning_mode,
        },
        'staff',
      ),
      parts: [{ text: `The review as it stands:\n\n"""${text.slice(0, 2000)}"""` }],
      responseMimeType: 'application/json',
      responseSchema: REVIEW_COMPOSE_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: 1200,
    });
    const { review } = parseComposedReview(result.text);
    if (!review) return NextResponse.json({ error: 'AI could not improve this one.' }, { status: 422 });
    return NextResponse.json({ suggestion: review });
  } catch (error: any) {
    if (error instanceof AiBlockedError) {
      return NextResponse.json({ error: error.message, manualPrompt: error.manualPrompt }, { status: 409 });
    }
    console.error('[testimonials] ai-tidy', error?.message || error);
    return NextResponse.json({ error: 'AI tidy failed. You can still edit by hand.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { checkBudget } from '@neram/ai';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  FEATURE_BY_MODE,
  estimateCost,
  tierForMode,
  type CostEstimateInput,
  type GenerateMode,
} from '@/lib/ai-question-cost';
import type { DraftFormat } from '@/lib/test-wizard-draft';

/**
 * POST /api/question-bank/tests/generate/estimate   (teacher/admin)
 *
 * What the next Generate press will cost, before it costs it.
 *
 * Writes nothing, calls no model, records no usage. It exists so the wizard can
 * print "₹0.82 est. · ~25 s" beside the button and grey the button out when the
 * budget is already spent, rather than letting a teacher press it and meet the
 * cap as an error afterwards.
 *
 * NOT edge, despite being pure arithmetic on the surface: checkBudget reads the
 * controls row and today's spend out of Supabase, so this needs the node
 * runtime like every other authed route here.
 */

const FORMATS: DraftFormat[] = ['MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED'];
const MAX_COUNT = 80;

function clampCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(MAX_COUNT, Math.round(n)));
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can build tests' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const mode: GenerateMode =
      body?.mode === 'pdf' || body?.mode === 'recording' ? body.mode : 'topic';
    const formats: DraftFormat[] = Array.isArray(body?.formats)
      ? body.formats.filter((f: unknown): f is DraftFormat => FORMATS.includes(f as DraftFormat))
      : ['MCQ'];

    const featureId = FEATURE_BY_MODE[mode];
    const verdict = await checkBudget(featureId);

    const input: CostEstimateInput = {
      mode,
      count: clampCount(body?.count),
      formats,
      steerChars: Number(body?.steer_chars) || 0,
      transcriptChars: Number(body?.transcript_chars) || 0,
      pageCount: Number(body?.page_count) || 0,
      fileBytes: Number(body?.file_bytes) || 0,
      // Read from the controls the verdict already loaded, so the rupee figure
      // on screen and the one the usage panel reports come from one value.
      usdToInr: verdict.controls.usdToInr,
    };
    const estimate = estimateCost(input);

    return NextResponse.json({
      data: {
        ...estimate,
        feature_id: featureId,
        tier: tierForMode(mode),
        allowed: verdict.allowed,
        reason: verdict.reason,
        message: verdict.message,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to estimate';
    console.error('Test generate estimate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

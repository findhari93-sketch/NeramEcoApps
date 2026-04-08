import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { generateDrawingAIFeedback } from '@/lib/drawing-ai';

/**
 * POST /api/drawing/ai-feedback
 * Body: { submission_id: string }
 *
 * Uses Google Gemini (free tier) by default.
 * Falls back to Anthropic Claude if ANTHROPIC_API_KEY is set and GEMINI_API_KEY is not.
 *
 * Env vars:
 * - GEMINI_API_KEY (free: 15 RPM, 1M tokens/day)
 * - ANTHROPIC_API_KEY (paid, optional fallback)
 *
 * Also accepts internal calls with X-Service-Key header (no MS token needed).
 * Used by the submission creation endpoint to trigger background AI generation.
 */

export async function POST(request: NextRequest) {
  try {
    // Allow internal server-side calls using service key (no MS token needed)
    const serviceKey = request.headers.get('X-Service-Key');
    const isInternalCall = serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!isInternalCall) {
      // Regular authenticated call from teacher or student UI
      await verifyMsToken(request.headers.get('Authorization'));
    }

    const body = await request.json();
    const { submission_id } = body;

    if (!submission_id) {
      return NextResponse.json({ error: 'Missing submission_id' }, { status: 400 });
    }

    const feedback = await generateDrawingAIFeedback(submission_id);
    return NextResponse.json({ feedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI feedback failed';
    console.error('AI feedback error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

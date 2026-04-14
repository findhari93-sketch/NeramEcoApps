import { NextResponse } from 'next/server';

/**
 * POST /api/drawing/ai-feedback
 *
 * AI feedback generation has been disabled. Drawing evaluation is now done
 * manually by teachers using standardized prompts copied into Gemini.
 * Existing AI feedback data in the database is preserved for old submissions.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'AI feedback generation has been disabled. Use the manual evaluation workflow instead.' },
    { status: 410 }
  );
}

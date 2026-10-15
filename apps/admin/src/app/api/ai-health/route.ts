export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAiCreditsHealth } from '@neram/database';

const NO_STORE = { 'Cache-Control': 'no-store' };

// GET /api/ai-health -> { blocked, since, failedCalls, lastOkAt }
// Whether Gemini is refusing for lack of credit (a 402 since the last success).
// Drives the red banner on Chat History.
export async function GET() {
  try {
    return NextResponse.json(await getAiCreditsHealth(), { headers: NO_STORE });
  } catch (err) {
    console.error('[ai-health] failed:', err);
    return NextResponse.json({ error: 'Could not read AI health' }, { status: 500, headers: NO_STORE });
  }
}

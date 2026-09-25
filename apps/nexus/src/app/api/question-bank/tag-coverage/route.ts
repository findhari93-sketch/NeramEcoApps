import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyQBStaff } from '@/lib/qb-auth';
import { describeError, errorResponse } from '@/lib/api-errors';
import { computeCoverage } from '@/lib/qb-tag-coverage';

/**
 * GET /api/question-bank/tag-coverage
 *
 * How much of the bank carries a subject or theme tag, and, for every theme
 * tag and architecture subject tag, how many questions are tagged with it and
 * how many more the keyword dictionary suggests. Staff only.
 *
 * { data: { total, tagged, untagged,
 *           topics: [{ tag_id, slug, label, group_type, tagged_count,
 *                      suggestion_count, high_confidence_count }] } }
 *
 * Topics are sorted by suggestion_count, largest gap first. No model call: the
 * suggestions come from src/lib/qb-tag-keywords.ts.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const data = await computeCoverage(getSupabaseAdminClient());
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[QB tag coverage] GET failed:', describeError(err));
    return errorResponse(err, 'Could not load tag coverage');
  }
}

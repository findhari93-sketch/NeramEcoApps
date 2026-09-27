export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listLifecycleSuggestions, countOpenSuggestions } from '@neram/database';
import type { SuggestionKind } from '@neram/database';

const KINDS: SuggestionKind[] = ['check_in_student', 'archive_lead', 'deactivate_account', 'graduate_student'];
const STATUSES = ['open', 'accepted', 'dismissed', 'expired'] as const;

/**
 * GET /api/lifecycle/suggestions?kind=&status=open
 * Suggestions from the daily lifecycle rules. Suggestions only: accepting one is
 * a separate, audited action.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const kind = KINDS.includes(sp.get('kind') as SuggestionKind) ? (sp.get('kind') as SuggestionKind) : undefined;
  const statusParam = sp.get('status') as (typeof STATUSES)[number] | null;
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : 'open';
  try {
    const [suggestions, counts] = await Promise.all([listLifecycleSuggestions({ kind, status }), countOpenSuggestions()]);
    return NextResponse.json({ suggestions, counts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Lifecycle suggestions error:', error);
    return NextResponse.json({ error: 'Could not load suggestions.' }, { status: 500 });
  }
}

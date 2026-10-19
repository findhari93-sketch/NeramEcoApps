export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listDuplicateCandidates,
  countDuplicateTabs,
  getDuplicateSettings,
  getMergeUndoState,
} from '@neram/database';
import type { DuplicateStatus, DuplicateTab } from '@neram/database';

const TABS: DuplicateTab[] = ['ready', 'review', 'auto', 'history'];
const STATUSES: DuplicateStatus[] = ['open', 'merged', 'dismissed'];

/**
 * GET /api/duplicates?tab=ready|review|auto|history&limit=&offset=&user=
 * (older callers may still send status=open|merged|dismissed)
 *
 * The Duplicates queue, the tab counts, the automatic-merge setting, and for
 * merged pairs whether Undo is still possible. Staff only (middleware.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tabParam = sp.get('tab') as DuplicateTab | null;
    const statusParam = sp.get('status') as DuplicateStatus | null;
    const tab = tabParam && TABS.includes(tabParam) ? tabParam : undefined;
    const status = !tab && statusParam && STATUSES.includes(statusParam) ? statusParam : undefined;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0);
    const userParam = sp.get('user');
    const userId = userParam && /^[0-9a-f-]{36}$/i.test(userParam) ? userParam : undefined;

    const [{ candidates, total }, counts, settings] = await Promise.all([
      listDuplicateCandidates({ tab: tab ?? (status ? undefined : 'review'), status, limit, offset, userId }),
      countDuplicateTabs(),
      getDuplicateSettings(),
    ]);
    const undo = await getMergeUndoState(candidates.map((c) => c.merge_log_id).filter(Boolean) as string[]);
    const withUndo = candidates.map((c) => ({ ...c, undo: c.merge_log_id ? undo[c.merge_log_id] ?? null : null }));

    return NextResponse.json(
      { candidates: withUndo, total, counts, settings, openCount: counts.ready + counts.review },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Duplicates list error:', error);
    return NextResponse.json({ error: 'Could not load the duplicates queue.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getQBCategoryProposals,
  getQBProposalSummary,
  setQBProposalStatus,
  applyQBCategoryProposals,
} from '@neram/database';
import type { QBProposalStatus } from '@neram/database';

const STATUSES: QBProposalStatus[] = ['pending', 'approved', 'rejected', 'applied', 'stale'];

/**
 * GET /api/question-bank/category-proposals   (teacher/admin only)
 *
 * Staged category re-classifications awaiting human review, joined to their
 * question text. Query: ?status=pending&page=1&page_size=25
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can review classifications' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const statusParam = params.get('status') as QBProposalStatus | null;
    const status = statusParam && STATUSES.includes(statusParam) ? statusParam : 'pending';
    const page = params.get('page') ? parseInt(params.get('page')!, 10) : 1;
    const pageSize = params.get('page_size') ? parseInt(params.get('page_size')!, 10) : 25;

    const [{ proposals, total }, summary] = await Promise.all([
      getQBCategoryProposals({ status, page, pageSize }),
      getQBProposalSummary(),
    ]);

    return NextResponse.json({ data: proposals, total, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load proposals';
    console.error('QB category-proposals GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/question-bank/category-proposals   (teacher/admin only)
 *
 * Body: { ids: string[], action: 'approve' | 'reject' | 'apply' }
 *
 * `apply` is the only action that touches live questions. It goes through the
 * nexus_qb_apply_category_proposals RPC so categories[] and the tag join table
 * are written together.
 */
export async function PATCH(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can review classifications' }, { status: 403 });
    }

    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    const action = body?.action;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids is required' }, { status: 400 });
    }
    if (!['approve', 'reject', 'apply'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject or apply' }, { status: 400 });
    }

    if (action === 'apply') {
      const result = await applyQBCategoryProposals(ids, access.caller.id);
      return NextResponse.json({ data: result });
    }

    const updated = await setQBProposalStatus(
      ids,
      action === 'approve' ? 'approved' : 'rejected',
      access.caller.id,
    );
    return NextResponse.json({ data: { updated } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update proposals';
    console.error('QB category-proposals PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

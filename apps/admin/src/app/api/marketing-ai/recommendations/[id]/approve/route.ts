export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/marketing-ai/recommendations/:id/approve  { note?, execute? }
 * Approves the recommendation. With execute: true and an executable category,
 * runs it straight away through actions.ts (drift check, dry run, mutate).
 * Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeRecommendation } from '@/lib/marketing-ai/actions';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse, readJson } from '@/lib/marketing-ai/http';
import { agentContext } from '@/lib/marketing-ai/pipeline';
import { transition } from '@/lib/marketing-ai/recommendations';
import { db } from '@/lib/marketing-ai/store';
import { isExecutable } from '@/lib/marketing-ai/types';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await readJson(request);
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
    const actor = { type: 'admin' as const, id: guard.adminId };
    const rec = await transition(db(), params.id, 'approved', actor, { note });

    if (body.execute === true && isExecutable(rec.category)) {
      const ctx = await agentContext();
      const outcome = await executeRecommendation({ ...ctx, actor }, rec.id);
      return NextResponse.json({ status: 'approved', execution: outcome });
    }
    return NextResponse.json({ status: 'approved' });
  } catch (err) {
    return errorResponse(err, 'approve');
  }
}

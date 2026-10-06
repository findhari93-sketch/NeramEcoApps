export const dynamic = 'force-dynamic';

/**
 * POST /api/marketing-ai/recommendations/:id/reject  { note? }
 * A rejected finding is not raised again for 30 days. The note is kept, so the
 * reason the agent was wrong is on record. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse, readJson } from '@/lib/marketing-ai/http';
import { transition } from '@/lib/marketing-ai/recommendations';
import { db } from '@/lib/marketing-ai/store';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await readJson(request);
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
    await transition(db(), params.id, 'rejected', { type: 'admin', id: guard.adminId }, { note });
    return NextResponse.json({ status: 'rejected' });
  } catch (err) {
    return errorResponse(err, 'reject');
  }
}

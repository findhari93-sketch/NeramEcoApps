import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { updateQBTag } from '@neram/database';

/**
 * PATCH /api/question-bank/tags/[id]   (teacher/admin only)
 * Rename / recolor / reorder / (de)activate a tag.
 * Body: { label?, parent_id?, color?, icon?, sort_order?, is_active? }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can manage tags' }, { status: 403 });
    }

    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (typeof body.label === 'string') patch.label = body.label.trim();
    if ('parent_id' in body) patch.parent_id = body.parent_id ?? null;
    if ('color' in body) patch.color = body.color ?? null;
    if ('icon' in body) patch.icon = body.icon ?? null;
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const tag = await updateQBTag(params.id, patch as any);
    return NextResponse.json({ data: tag });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update tag';
    const status = /system.*cannot be deactivated/i.test(message) ? 403 : 500;
    if (status === 500) console.error('QB tag PATCH error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}

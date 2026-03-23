import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { linkVariant } from '@neram/database/queries';

/**
 * POST /api/exam-recall/threads/[id]/link
 *
 * Link two threads as variants (bidirectional).
 * Body: { linked_thread_id, variant_type }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { linked_thread_id, variant_type } = body;

    if (!linked_thread_id || !variant_type) {
      return NextResponse.json(
        { error: 'Missing required fields: linked_thread_id, variant_type' },
        { status: 400 },
      );
    }

    if (id === linked_thread_id) {
      return NextResponse.json({ error: 'Cannot link a thread to itself' }, { status: 400 });
    }

    const variants = await linkVariant(id, linked_thread_id, variant_type, user.id);

    return NextResponse.json({ variants }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link variant';
    console.error('[exam-recall/threads/[id]/link] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

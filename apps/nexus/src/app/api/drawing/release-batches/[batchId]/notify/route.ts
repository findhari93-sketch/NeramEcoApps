/**
 * Announce a released batch, one chunk per call.
 *
 * The hand-back dialog calls this until `remaining` is 0. It is split from the
 * release so that running out of function time while messaging a large class
 * can never undo or block the hand-back itself, and the cursor on the batch row
 * means a call that dies halfway resumes rather than messaging anyone twice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { shareBaseUrl } from '@/lib/class-share-links';
import { notifyBatchChunk } from '@/lib/drawing-release-server';

// Fifteen personalised Teams cards, each possibly a chat create plus a retry.
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id, name, user_type')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user || !['teacher', 'admin'].includes(user.user_type as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { batchId } = await params;

    const result = await notifyBatchChunk({
      supabase,
      batchId,
      graphToken: extractBearerToken(authHeader),
      teacherName: user.name ?? null,
      linkBase: shareBaseUrl(request.nextUrl.origin),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not notify students' },
      { status: 500 },
    );
  }
}

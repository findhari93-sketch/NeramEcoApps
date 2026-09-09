import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getQBTopicTree, getQBTopicCounts } from '@neram/database';

import { TtlCache } from '@/lib/ttl-cache';

import { describeError } from '@/lib/api-errors';

/**
 * The topic tree and its counts, held for a few minutes.
 *
 * Same reasoning as the exam tree next door: this is catalogue structure, it is
 * the same for every student, and it was recomputed on every mount of the
 * questions page. Module scope, so per warm instance.
 */
const TOPICS_TTL_MS = 5 * 60 * 1000;
const topicsCache = new TtlCache<{ data: unknown; counts: unknown }>(TOPICS_TTL_MS, 1);
const TOPICS_KEY = 'qb-topics';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let payload = topicsCache.get(TOPICS_KEY);
    if (!payload) {
      const [data, counts] = await Promise.all([
        getQBTopicTree(supabase),
        getQBTopicCounts(supabase),
      ]);
      payload = { data, counts };
      topicsCache.set(TOPICS_KEY, payload);
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

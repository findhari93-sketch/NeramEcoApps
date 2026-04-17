import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

const VALID_EVENTS = ['query', 'click', 'no_results'] as const;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { event_type, query, result_path, result_position, result_count, session_id } = body;

    if (!event_type || !VALID_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    await supabase.from('search_analytics').insert({
      event_type,
      query: query.slice(0, 200),
      result_path: result_path?.slice(0, 500) || null,
      result_position: typeof result_position === 'number' ? result_position : null,
      result_count: typeof result_count === 'number' ? result_count : null,
      session_id: session_id?.slice(0, 100) || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Don't expose errors for analytics - fail silently
    return NextResponse.json({ ok: true });
  }
}

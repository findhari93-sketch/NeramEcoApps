export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { buildChatGeoSummary, type RawChatGeoSummary } from '@/lib/chat-geo';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** An ISO timestamp, or null for "no bound". Anything else is refused. */
function bound(raw: string | null): string | null | undefined {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

// GET /api/chatbot-logs/geo?from=ISO&to=ISO&source=general_chatbot
// Where Aintra's chatters are: distinct sessions per state, city and country,
// from chatbot_geo_summary (migration 20261129090100). Caller auth is the
// admin middleware's job, as for every /api route here.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = bound(searchParams.get('from'));
  const to = bound(searchParams.get('to'));
  const source = searchParams.get('source') || null;

  if (from === undefined || to === undefined) {
    return NextResponse.json({ error: 'from and to must be ISO dates' }, { status: 400 });
  }
  if (source && !['general_chatbot', 'nata_chatbot'].includes(source)) {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any).rpc('chatbot_geo_summary', {
      p_from: from,
      p_to: to,
      p_source: source,
    });
    if (error) throw error;
    return NextResponse.json(buildChatGeoSummary(data as RawChatGeoSummary), { headers: NO_STORE });
  } catch (err) {
    console.error('[chatbot-logs/geo] failed:', err);
    return NextResponse.json({ error: 'Could not load locations' }, { status: 500, headers: NO_STORE });
  }
}

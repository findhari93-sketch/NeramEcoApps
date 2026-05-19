// @ts-nocheck - Supabase types not generated for ask_seniors tables
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    const year = searchParams.get('year');
    const search = searchParams.get('search');
    const state = searchParams.get('state');

    const supabase = getSupabaseAdminClient();

    // Resolve event_id from year if provided
    let resolvedEventId = eventId;
    if (!resolvedEventId && year) {
      const { data: ev } = await supabase
        .from('ask_seniors_events')
        .select('id')
        .eq('year', parseInt(year))
        .single();
      resolvedEventId = ev?.id ?? null;
    }

    // If neither provided, fetch the most recent active/upcoming event
    if (!resolvedEventId) {
      const { data: ev } = await supabase
        .from('ask_seniors_events')
        .select('id')
        .in('status', ['upcoming', 'active', 'completed'])
        .order('year', { ascending: false })
        .limit(1)
        .single();
      resolvedEventId = ev?.id ?? null;
    }

    if (!resolvedEventId) {
      return NextResponse.json({ registrations: [], total: 0, event: null, stats: null });
    }

    // Fetch the event
    const { data: eventData } = await supabase
      .from('ask_seniors_events')
      .select('*')
      .eq('id', resolvedEventId)
      .single();

    // Build registrations query
    let query = supabase
      .from('ask_seniors_registrations')
      .select('*', { count: 'exact' })
      .eq('event_id', resolvedEventId)
      .order('registered_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (state) {
      query = query.eq('state', state);
    }

    const { data: registrations, count, error } = await query;

    if (error) {
      console.error('[ask-seniors/registrations]', error);
      return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }

    // Compute quick stats
    const all = registrations ?? [];
    const avgCutoff = all.length
      ? Math.round(all.reduce((s: number, r: any) => s + (r.final_cutoff ?? 0), 0) / all.length * 10) / 10
      : 0;
    const stateMap: Record<string, number> = {};
    all.forEach((r: any) => { if (r.state) stateMap[r.state] = (stateMap[r.state] ?? 0) + 1; });
    const topState = Object.entries(stateMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return NextResponse.json({
      registrations: all,
      total: count ?? 0,
      event: eventData,
      stats: {
        total: count ?? 0,
        avg_cutoff: avgCutoff,
        top_state: topState,
        states: stateMap,
      },
    });
  } catch (err) {
    console.error('[ask-seniors/registrations] unexpected error', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

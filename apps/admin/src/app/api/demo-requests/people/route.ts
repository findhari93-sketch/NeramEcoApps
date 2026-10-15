export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { ACTIVE_DEMO_STATUSES } from '@neram/database/demo-schedule';

export interface DemoPerson {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  user_type: string;
  /** The account is the parent's (user_type parent, or marked so on a demo). */
  is_parent_account: boolean;
  open_request: { id: string; ref_code: string | null; status: string } | null;
}

/**
 * GET /api/demo-requests/people?q=  (Add demo's "Search People")
 *
 * Searches users directly, unlike the CRM list: people who never signed in
 * (added at the desk), archived people and parent accounts all count here.
 * Staff accounts are left out. Staff only (middleware).
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('q') ?? '';
  // PostgREST or() syntax: keep commas, brackets and wildcards out of the term.
  const q = raw.replace(/[,()%*\\:"]/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ people: [] });

  try {
    const supabase = getSupabaseAdminClient() as any;
    const digits = q.replace(/\D/g, '');
    const terms = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits.length >= 4) terms.push(`phone.ilike.%${digits.slice(-10)}%`);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone, email, user_type, metadata')
      .in('user_type', ['lead', 'student', 'parent'])
      .or(terms.join(','))
      .order('updated_at', { ascending: false })
      .limit(8);
    if (error) throw error;
    const users = (data ?? []) as Array<{ id: string; name: string | null; phone: string | null; email: string | null; user_type: string; metadata: Record<string, unknown> | null }>;

    const open: Record<string, DemoPerson['open_request']> = {};
    if (users.length) {
      const { data: rows, error: openError } = await supabase
        .from('demo_class_registrations')
        .select('id, user_id, ref_code, status')
        .in('user_id', users.map((u) => u.id))
        .not('ref_code', 'is', null)
        .in('status', ACTIVE_DEMO_STATUSES);
      if (openError) throw openError;
      for (const r of rows ?? []) open[r.user_id] = { id: r.id, ref_code: r.ref_code, status: r.status };
    }

    const people: DemoPerson[] = users.map((u) => ({
      id: u.id,
      name: u.name || '',
      phone: u.phone,
      email: u.email,
      user_type: u.user_type,
      is_parent_account: u.user_type === 'parent' || u.metadata?.account_holder === 'parent',
      open_request: open[u.id] ?? null,
    }));
    return NextResponse.json({ people });
  } catch (error) {
    console.error('demo people search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

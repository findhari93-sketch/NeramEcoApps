export const dynamic = 'force-dynamic';

/**
 * "Request an account" submissions from the college dashboard login page.
 * GET   ?status=pending|done|declined (default pending) -> { data, pending_count }  (?count_only=1 -> { pending_count })
 * PATCH { id, status: 'done' | 'declined' | 'pending' } -> { success }
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveStaff } from '@/lib/staff-actor';

const STATUSES = ['pending', 'done', 'declined'] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

const table = () => getSupabaseAdminClient().from('college_account_requests' as never) as any;

export async function GET(request: NextRequest) {
  const s = request.nextUrl.searchParams.get('status');
  const status: Status = isStatus(s) ? s : 'pending';
  if (request.nextUrl.searchParams.get('count_only') === '1') {
    const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pending_count: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const [list, pending] = await Promise.all([
    table()
      .select('id, college_name, college_id, name, email, phone, designation, message, status, handled_by, handled_at, created_at, colleges(name, slug)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(200),
    table().select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  if (list.error) return NextResponse.json({ error: list.error.message }, { status: 500 });
  return NextResponse.json(
    { data: list.data ?? [], pending_count: pending.count ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.id !== 'string' || !isStatus(body.status)) {
    return NextResponse.json({ error: "id and status ('pending', 'done' or 'declined') required" }, { status: 400 });
  }
  const staff = await resolveStaff(request, body);
  const done = body.status !== 'pending';
  const { data, error } = await table()
    .update({
      status: body.status,
      handled_by: done ? staff.name : null,
      handled_at: done ? new Date().toISOString() : null,
    })
    .eq('id', body.id)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}

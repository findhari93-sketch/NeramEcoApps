export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { staffName } from '@/lib/aintra-inbox/server';

const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/aintra-inbox/notes?userId=: counsellor notes on a signed-in person,
// newest first. Same admin_user_notes table the CRM uses, so a note written
// here shows on the person's CRM page too.
export async function GET(request: NextRequest) {
  const userId = new URL(request.url).searchParams.get('userId') ?? '';
  if (!UUID.test(userId)) return NextResponse.json({ error: 'Unknown person' }, { status: 400, headers: NO_STORE });
  const { data, error } = await (createAdminClient() as any)
    .from('admin_user_notes')
    .select('id, note, admin_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[aintra-inbox/notes] read failed:', error);
    return NextResponse.json({ error: 'Could not load notes' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ notes: data ?? [] }, { headers: NO_STORE });
}

// POST /api/aintra-inbox/notes { userId, note }
export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to add a note' }, { status: 401, headers: NO_STORE });
  let body: any = null;
  try {
    body = await request.json();
  } catch {
    // handled below
  }
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (!UUID.test(userId) || !note) {
    return NextResponse.json({ error: 'Write a note first' }, { status: 400, headers: NO_STORE });
  }
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from('admin_user_notes')
    .insert({ user_id: userId, admin_id: adminId, admin_name: (await staffName(db, adminId)) ?? '', note })
    .select('id, note, admin_name, created_at')
    .single();
  if (error) {
    console.error('[aintra-inbox/notes] save failed:', error);
    return NextResponse.json({ error: 'Could not save the note' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ note: data }, { headers: NO_STORE });
}

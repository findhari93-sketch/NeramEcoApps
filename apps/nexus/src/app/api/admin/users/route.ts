import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/admin/users?q={query}&page={page}&limit={limit}
 *
 * List all users with optional search. Admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || caller.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('id, name, email, phone, avatar_url, user_type, status, created_at, ms_oid, firebase_uid', { count: 'exact' });

    if (q && q.length >= 2) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch users';
    console.error('Admin users error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 * Body: { userId: string, user_type: string }
 *
 * Update a user's role. Admin-only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || caller.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, user_type } = body;

    if (!userId || !user_type) {
      return NextResponse.json({ error: 'userId and user_type are required' }, { status: 400 });
    }

    const validTypes = ['student', 'teacher', 'admin', 'parent'];
    if (!validTypes.includes(user_type)) {
      return NextResponse.json({ error: `Invalid user_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    // Prevent demoting self
    if (userId === caller.id && user_type !== 'admin') {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({ user_type })
      .eq('id', userId)
      .select('id, name, email, user_type')
      .single();

    if (error) throw error;

    return NextResponse.json({ user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user';
    console.error('Admin update user error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

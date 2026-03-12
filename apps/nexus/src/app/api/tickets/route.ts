import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/tickets?classroom={id}
 * Returns support tickets for the current user in a classroom
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check role
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', classroomId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    let query = supabase
      .from('support_tickets')
      .select('*, comments:support_ticket_comments(id, content, created_at, user:users(name))')
      .order('created_at', { ascending: false });

    if (enrollment?.role === 'teacher') {
      // Teachers see all tickets in classroom
      query = query.eq('context->classroom_id' as any, classroomId);
    } else {
      // Students see own tickets
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ tickets: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tickets';
    console.error('Tickets GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/tickets
 * Create a new support ticket
 * Body: { classroom_id, title, description }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { classroom_id, title, description } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, phone')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a ticket number (NX-timestamp)
    const ticketNumber = `NX-${Date.now().toString(36).toUpperCase()}`;

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        user_name: user.name || 'Unknown',
        user_email: user.email || null,
        user_phone: user.phone || null,
        subject: title,
        description: description || 'No description provided',
        ticket_number: ticketNumber,
        source_app: 'nexus',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create ticket';
    console.error('Tickets POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

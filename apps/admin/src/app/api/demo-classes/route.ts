import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listDemoSlots,
  createDemoSlot,
  type DemoSlotStatus,
} from '@neram/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = getSupabaseAdminClient();

    // Parse status filter
    const status = statusParam
      ? (statusParam.split(',') as DemoSlotStatus[])
      : undefined;

    const { slots, count } = await listDemoSlots(
      { limit, offset, status, includeCount: true },
      supabase
    );

    // Get stats for dashboard
    const { data: allSlots } = await supabase
      .from('demo_class_slots' as any)
      .select('id, status, current_registrations')
      .gte('slot_date', new Date().toISOString().split('T')[0]) as { data: { id: string; status: string; current_registrations: number }[] | null };

    const { count: pendingCount } = await supabase
      .from('demo_class_registrations' as any)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: totalRegistrations } = await supabase
      .from('demo_class_registrations' as any)
      .select('*', { count: 'exact', head: true });

    const stats = {
      totalSlots: count || 0,
      upcomingSlots: allSlots?.filter(s => ['scheduled', 'confirmed'].includes(s.status)).length || 0,
      totalRegistrations: totalRegistrations || 0,
      pendingApprovals: pendingCount || 0,
    };

    return NextResponse.json({ slots, count, stats });
  } catch (error) {
    console.error('Error fetching demo slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch demo slots' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Validate required fields
    if (!body.slot_date || !body.slot_time) {
      return NextResponse.json(
        { error: 'Date and time are required' },
        { status: 400 }
      );
    }

    const slot = await createDemoSlot(
      {
        title: body.title || 'Free Demo Class',
        description: body.description,
        slot_date: body.slot_date,
        slot_time: body.slot_time,
        duration_minutes: body.duration_minutes || 60,
        min_registrations: body.min_registrations || 10,
        max_registrations: body.max_registrations || 50,
        demo_mode: body.demo_mode || 'online',
        instructor_name: body.instructor_name,
        instructor_id: body.instructor_id,
        course_id: body.course_id,
        created_by: body.created_by,
      },
      supabase
    );

    return NextResponse.json({ slot }, { status: 201 });
  } catch (error) {
    console.error('Error creating demo slot:', error);
    return NextResponse.json(
      { error: 'Failed to create demo slot' },
      { status: 500 }
    );
  }
}

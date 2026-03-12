import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/resources?classroom={id}&topic={id}
 * Returns learning resources for a classroom, optionally filtered by topic
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const topicId = request.nextUrl.searchParams.get('topic');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('nexus_resources')
      .select('*, topic:nexus_topics(id, title, category)')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (topicId) {
      query = query.eq('topic_id', topicId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ resources: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load resources';
    console.error('Resources GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/resources
 * Create a new resource (teacher only)
 * Body: { classroom_id, topic_id?, title, description?, resource_type, url, thumbnail_url? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify teacher
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', body.classroom_id)
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can add resources' }, { status: 403 });
    }

    const { data: resource, error } = await supabase
      .from('nexus_resources')
      .insert({
        classroom_id: body.classroom_id,
        topic_id: body.topic_id || null,
        title: body.title,
        description: body.description || null,
        resource_type: body.resource_type,
        url: body.url,
        thumbnail_url: body.thumbnail_url || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create resource';
    console.error('Resources POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

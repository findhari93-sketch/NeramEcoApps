import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/checklist?classroom={id}&mode={manage}
 *
 * Returns checklist items for a classroom.
 * - Default: includes student's own completion progress
 * - mode=manage: includes completion counts per item (teacher view)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const mode = request.nextUrl.searchParams.get('mode');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    if (mode === 'manage') {
      // Teacher view: items with completion counts, resource counts, total students
      const [itemsResult, enrollmentResult] = await Promise.all([
        supabase
          .from('nexus_checklist_items')
          .select('*, topic:nexus_topics(id, title, category), resources:nexus_checklist_resources(id)')
          .eq('classroom_id', classroomId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),

        // Count active students in this classroom
        supabase
          .from('nexus_enrollments')
          .select('id')
          .eq('classroom_id', classroomId)
          .eq('role', 'student')
          .eq('is_active', true),
      ]);

      if (itemsResult.error) throw itemsResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;

      const items = itemsResult.data || [];
      const totalStudents = (enrollmentResult.data || []).length;

      // Get completion counts per item
      const itemIds = items.map((i) => i.id);
      let completionCounts: Record<string, number> = {};

      if (itemIds.length > 0) {
        const { data: counts, error: countError } = await supabase
          .from('nexus_student_checklist_progress')
          .select('checklist_item_id')
          .in('checklist_item_id', itemIds)
          .eq('is_completed', true);

        if (countError) throw countError;

        completionCounts = (counts || []).reduce(
          (acc: Record<string, number>, row) => {
            acc[row.checklist_item_id] = (acc[row.checklist_item_id] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );
      }

      const itemsWithCounts = items.map((item) => ({
        ...item,
        resource_count: (item.resources as { id: string }[] | null)?.length || 0,
        resources: undefined, // Don't send full resource objects in manage mode
        completed_count: completionCounts[item.id] || 0,
        total_students: totalStudents,
      }));

      return NextResponse.json({ items: itemsWithCounts });
    }

    // Student view: items with own progress
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [itemsResult, progressResult] = await Promise.all([
      supabase
        .from('nexus_checklist_items')
        .select('*, topic:nexus_topics(id, title, category), resources:nexus_checklist_resources(id, url, resource_type)')
        .eq('classroom_id', classroomId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),

      supabase
        .from('nexus_student_checklist_progress')
        .select('checklist_item_id, is_completed, completed_at')
        .eq('student_id', user.id),
    ]);

    if (itemsResult.error) throw itemsResult.error;
    if (progressResult.error) throw progressResult.error;

    const progressMap = new Map(
      (progressResult.data || []).map((p) => [p.checklist_item_id, p]),
    );

    const itemsWithProgress = (itemsResult.data || []).map((item) => {
      const progress = progressMap.get(item.id);
      return {
        ...item,
        // Map resource_type to type for frontend consistency
        resources: ((item.resources as { id: string; url: string; resource_type: string }[] | null) || []).map((r) => ({
          id: r.id,
          url: r.url,
          type: r.resource_type,
        })),
        is_completed: progress?.is_completed || false,
        completed_at: progress?.completed_at || null,
      };
    });

    return NextResponse.json({ items: itemsWithProgress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load checklist';
    console.error('Checklist GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/checklist
 *
 * Create a new checklist item (teacher only).
 * Body: { classroom_id, topic_id, title, description?, sort_order?, resource_urls?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const body = await request.json();
    const { classroom_id, topic_id, title, description, sort_order, resource_urls } = body;

    if (!classroom_id || !title) {
      return NextResponse.json({ error: 'Missing required fields: classroom_id, title' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify user is a teacher in this classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('classroom_id', classroom_id)
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Only teachers can create checklist items' }, { status: 403 });
    }

    const { data: item, error } = await supabase
      .from('nexus_checklist_items')
      .insert({
        classroom_id,
        topic_id: topic_id || null,
        title,
        description: description || null,
        sort_order: sort_order ?? 0,
        is_active: true,
      })
      .select('*, topic:nexus_topics(id, title, category)')
      .single();

    if (error) throw error;

    // Save resource URLs if provided
    if (resource_urls && Array.isArray(resource_urls) && resource_urls.length > 0) {
      const resources = resource_urls.map((url: string, i: number) => {
        // Detect resource type from URL
        let resource_type = 'link';
        if (url.includes('youtube.com') || url.includes('youtu.be')) resource_type = 'youtube';
        else if (url.endsWith('.pdf')) resource_type = 'pdf';
        else if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url)) resource_type = 'image';
        else if (url.includes('onenote.com') || url.includes('onenote:')) resource_type = 'onenote';

        return {
          checklist_item_id: item.id,
          title: url.split('/').pop() || 'Resource',
          resource_type,
          url,
          sort_order: i,
        };
      });

      await supabase.from('nexus_checklist_resources').insert(resources);
    }

    return NextResponse.json({ item: { ...item, completed_count: 0, total_students: 0, resource_count: resource_urls?.length || 0 } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checklist item';
    console.error('Checklist POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

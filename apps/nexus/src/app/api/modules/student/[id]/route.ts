import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/student/[id]
 * Get a published module with its items and student progress.
 * Items are returned in sort_order with sequential unlock logic.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: moduleId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch module (must be published)
    const { data: mod, error: modError } = await supabase
      .from('nexus_modules')
      .select('*')
      .eq('id', moduleId)
      .eq('is_published', true)
      .single();

    if (modError || !mod) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Fetch published items ordered by sort_order
    const { data: items, error: itemsError } = await supabase
      .from('nexus_module_items')
      .select('*')
      .eq('module_id', moduleId)
      .eq('is_published', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (itemsError) throw itemsError;

    const itemIds = (items || []).map((i: any) => i.id);

    // Fetch student progress for all items
    let progressMap: Record<string, any> = {};
    if (itemIds.length > 0) {
      const { data: progress } = await supabase
        .from('nexus_module_student_progress')
        .select('*')
        .eq('student_id', user.id)
        .in('module_item_id', itemIds);

      for (const p of progress || []) {
        progressMap[p.module_item_id] = p;
      }
    }

    // Build items with status (sequential unlock logic)
    const itemsWithStatus = (items || []).map((item: any, index: number) => {
      const progress = progressMap[item.id];
      let status: 'locked' | 'in_progress' | 'completed' = 'locked';

      if (progress?.status === 'completed') {
        status = 'completed';
      } else if (progress?.status === 'in_progress') {
        status = 'in_progress';
      } else if (index === 0) {
        // First item is always unlocked
        status = 'in_progress';
      } else {
        // Unlocked if previous item is completed
        const prevItem = (items || [])[index - 1];
        const prevProgress = progressMap[prevItem.id];
        if (prevProgress?.status === 'completed') {
          status = 'in_progress';
        }
      }

      return {
        id: item.id,
        title: item.title,
        description: item.description,
        item_type: item.item_type,
        video_source: item.video_source,
        youtube_video_id: item.youtube_video_id,
        chapter_number: item.chapter_number,
        sort_order: item.sort_order,
        status,
        last_video_position_seconds: progress?.last_video_position_seconds || 0,
      };
    });

    return NextResponse.json({
      module: {
        id: mod.id,
        title: mod.title,
        description: mod.description,
        icon: mod.icon,
        color: mod.color,
        module_type: mod.module_type,
      },
      items: itemsWithStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load module';
    console.error('Student module detail GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

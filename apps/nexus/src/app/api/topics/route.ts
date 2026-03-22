import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/topics?classroom={classroomId}
 * Returns topics for the given classroom, merging:
 *   1. Manual nexus_topics for this classroom
 *   2. Module item titles from nexus_modules → nexus_module_items (global)
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom parameter is required' }, { status: 400 });
    }

    // Fetch manual topics for this classroom
    const { data: manualTopics } = await supabase
      .from('nexus_topics')
      .select('id, title, category')
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    // Fetch published modules with their items
    const { data: modules } = await supabase
      .from('nexus_modules')
      .select('id, title, nexus_module_items(id, title, sort_order)')
      .eq('is_published', true)
      .order('title', { ascending: true });

    // Build merged topic list
    const topics: Array<{ id: string; title: string; category: string }> = [];

    // Add manual topics first
    for (const t of manualTopics || []) {
      topics.push({ id: t.id, title: t.title, category: t.category || 'general' });
    }

    // Add module items grouped under their module title as category
    for (const mod of modules || []) {
      const items = (mod.nexus_module_items || [])
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      for (const item of items) {
        topics.push({
          id: item.id,
          title: item.title,
          category: mod.title,
        });
      }
    }

    return NextResponse.json({ topics });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load topics';
    console.error('Topics GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

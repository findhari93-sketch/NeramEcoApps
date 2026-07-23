import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Past classes that have a recording, searchable and filterable by tag.
 *
 * This is what the class tags are for. A term's worth of classes is a hundred
 * rows called "Class by Ar Hari Babu"; naming and tagging them at wrap-up is
 * only worth doing if it makes them findable afterwards, which is here.
 *
 * Searches the title and the brief. Tag filtering is AND, not OR: picking
 * Aptitude and Perspective means classes that were both, which is the narrowing
 * people expect from filter chips.
 */

const SELECT =
  'id, classroom_id, title, description, scheduled_date, start_time, end_time, recording_url, youtube_url, teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url)';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const classroomIds = [...new Set((enrollments || []).map((e: any) => e.classroom_id))];
    if (classroomIds.length === 0) {
      return NextResponse.json({ recordings: [], tags: [] });
    }

    const isStaff = user.user_type === 'admin' || user.user_type === 'teacher';
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const tagParam = request.nextUrl.searchParams.get('tags') || '';
    const tagIds = tagParam.split(',').map((t) => t.trim()).filter(Boolean);

    // Narrow by tag FIRST when tags are picked, so the class query stays small
    // instead of loading a term and filtering it in memory.
    let idsWithAllTags: string[] | null = null;
    if (tagIds.length > 0) {
      const { data: tagRows } = await supabase
        .from('nexus_class_tags')
        .select('scheduled_class_id, tag_id')
        .in('tag_id', tagIds);

      const counts = new Map<string, number>();
      for (const r of tagRows || []) {
        counts.set(r.scheduled_class_id, (counts.get(r.scheduled_class_id) || 0) + 1);
      }
      // AND semantics: a class must carry every chosen tag.
      idsWithAllTags = [...counts.entries()]
        .filter(([, n]) => n === tagIds.length)
        .map(([id]) => id);

      if (idsWithAllTags.length === 0) {
        return NextResponse.json({ recordings: [], tags: [] });
      }
    }

    let query = supabase
      .from('nexus_scheduled_classes')
      .select(SELECT)
      .in('classroom_id', classroomIds)
      .or('recording_url.not.is.null,youtube_url.not.is.null')
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: false })
      .limit(200);

    // Students never see a class their teacher has not published.
    if (!isStaff) query = query.eq('publish_state', 'published');
    if (idsWithAllTags) query = query.in('id', idsWithAllTags);
    if (q) {
      // Escape the PostgREST or() separators so a comma in the search box does
      // not become a second filter.
      const safe = q.replace(/[,()]/g, ' ');
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    const { data: classes, error } = await query;
    if (error) throw error;

    // Tags for the classes actually returned, so the list can show them and the
    // filter bar can offer only tags that would find something.
    const ids = (classes || []).map((c: any) => c.id);
    const tagsByClass: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from('nexus_class_tags')
        .select('scheduled_class_id, tag:nexus_qb_tags(id, slug, label, group_type)')
        .in('scheduled_class_id', ids);
      for (const r of rows || []) {
        if (!r.tag) continue;
        (tagsByClass[r.scheduled_class_id] ||= []).push(r.tag);
      }
    }

    const { data: allTags } = await supabase
      .from('nexus_qb_tags')
      .select('id, slug, label, group_type')
      .in('group_type', ['subject', 'theme'])
      .eq('is_active', true)
      .order('group_type', { ascending: true })
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      recordings: (classes || []).map((c: any) => ({ ...c, tags: tagsByClass[c.id] || [] })),
      tags: allTags || [],
      canSeeUnpublished: isStaff,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load recordings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

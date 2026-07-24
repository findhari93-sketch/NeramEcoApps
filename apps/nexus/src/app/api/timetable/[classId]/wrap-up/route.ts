import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { buildClassLinkPatch } from '@/lib/class-links';
import { syncClassToLibrary } from '@/lib/class-library-bridge';

/**
 * Wrap up a class after it has happened.
 *
 * The topic is often not known in advance: a class gets scheduled as "Class by
 * Ar Hari Babu" and only afterwards is it clear that it covered perspective
 * basics, that it was Aptitude rather than Mathematics, and roughly what was
 * taken. Until now none of that could be recorded from the timetable, so the
 * calendar filled with untitled classes nobody could search later.
 *
 * Everything here writes to columns that already exist. The one new thing is
 * tags, which reuse the question bank's registry (nexus_qb_tags) rather than a
 * second vocabulary, so a class and a question can be "Aptitude" in the same
 * sense and the recordings list can be filtered by it.
 *
 * Recording links go through the shared validator in lib/class-links, the same
 * one the Class Day screen uses.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS =
  'id, classroom_id, title, description, notes, summary_bullets, scheduled_date, start_time, end_time, topic_id, plan_entry_id, recording_url, youtube_url';

async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLS)
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();

  const isAdmin = user.user_type === 'admin';
  if (!enrollment && !isAdmin) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }

  const canEdit = isAdmin || user.user_type === 'teacher' || enrollment?.role === 'teacher';
  return { userId: user.id as string, canEdit, cls };
}

/** The tags currently on a class. */
async function loadTags(supabase: any, classId: string) {
  const { data } = await supabase
    .from('nexus_class_tags')
    .select('tag_id, tag:nexus_qb_tags(id, slug, label, group_type, color)')
    .eq('scheduled_class_id', classId);
  return (data || []).map((r: any) => r.tag).filter(Boolean);
}

/**
 * GET /api/timetable/[classId]/wrap-up
 *
 * What the class currently says about itself, plus the tag vocabulary to pick
 * from. Only subject and theme tags are offered: the exam group describes a
 * paper, not a lesson.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    const [tags, availableTags, topics] = await Promise.all([
      loadTags(supabase, params.classId),
      access.canEdit
        ? supabase
            .from('nexus_qb_tags')
            .select('id, slug, label, group_type, color')
            .in('group_type', ['subject', 'theme'])
            .eq('is_active', true)
            .order('group_type', { ascending: true })
            .order('sort_order', { ascending: true })
            .then((r: any) => r.data || [])
        : Promise.resolve([]),
      access.canEdit
        ? supabase
            .from('nexus_topics')
            .select('id, title, category')
            .eq('classroom_id', access.cls.classroom_id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .then((r: any) => r.data || [])
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      class: access.cls,
      tags,
      availableTags,
      topics,
      canEdit: access.canEdit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the class';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/timetable/[classId]/wrap-up  (staff)
 *
 * Body, all optional: { title, description, topic_id, tag_ids,
 *                       recording_url, youtube_url }
 *
 * Partial by design. A teacher who only pastes the YouTube link a week later
 * should not have to restate the title and tags to do it.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can wrap up a class' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title || '').trim();
      if (!title) return NextResponse.json({ error: 'Give the class a title.' }, { status: 400 });
      updates.title = title.slice(0, 200);
    }
    if (body.description !== undefined) {
      const brief = String(body.description || '').trim();
      updates.description = brief ? brief.slice(0, 2000) : null;
    }
    if (body.notes !== undefined) {
      const notes = String(body.notes || '').trim();
      updates.notes = notes ? notes.slice(0, 4000) : null;
    }
    if (body.topic_id !== undefined) {
      updates.topic_id = body.topic_id || null;
    }
    if (body.summary_bullets !== undefined) {
      const bullets = Array.isArray(body.summary_bullets)
        ? body.summary_bullets.map((b: unknown) => String(b || '').trim()).filter(Boolean).slice(0, 20)
        : [];
      updates.summary_bullets = bullets.length ? bullets : null;
    }

    const links = buildClassLinkPatch(body);
    if (!links.ok) return NextResponse.json({ error: links.error }, { status: 400 });
    Object.assign(updates, links.patch);

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('nexus_scheduled_classes')
        .update(updates)
        .eq('id', params.classId);
      if (error) throw error;
    }

    // Tags are replaced wholesale when supplied: the picker sends the complete
    // set, so a diff would only be a way to get out of step with it.
    if (Array.isArray(body.tag_ids)) {
      const ids = [...new Set(body.tag_ids.map((t: unknown) => String(t)).filter(Boolean))].slice(0, 12);
      await supabase.from('nexus_class_tags').delete().eq('scheduled_class_id', params.classId);
      if (ids.length > 0) {
        const { error } = await supabase
          .from('nexus_class_tags')
          .insert(ids.map((tag_id) => ({ scheduled_class_id: params.classId, tag_id })));
        // A tag deleted from the registry mid-edit should not lose the rest of
        // the wrap-up, so this reports rather than throws.
        if (error) {
          return NextResponse.json(
            { error: 'Saved, but one of those tags no longer exists. Pick them again.' },
            { status: 409 },
          );
        }
      }
    }

    // Mirror the recording into the student Library so its tags make it
    // searchable there. Best-effort: a Library hiccup must not fail the wrap-up.
    try {
      await syncClassToLibrary(supabase, params.classId);
    } catch (bridgeErr) {
      console.error('Class -> Library sync failed:', bridgeErr);
    }

    const { data: updated } = await supabase
      .from('nexus_scheduled_classes')
      .select(CLASS_COLS)
      .eq('id', params.classId)
      .single();

    return NextResponse.json({
      class: updated,
      tags: await loadTags(supabase, params.classId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the class';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

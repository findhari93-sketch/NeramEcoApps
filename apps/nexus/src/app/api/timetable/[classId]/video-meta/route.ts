import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { validateVideoMetaPatch } from '@/lib/class-video-meta-schema';
import { syncClassToLibrary } from '@/lib/class-library-bridge';
import { buildClassLinkPatch } from '@/lib/class-links';
import {
  VIDEO_META_CLASS_COLS,
  VIDEO_META_COLS,
  type VideoMetaClass,
} from '@/lib/class-video-meta-cols';

/**
 * The YouTube upload record for one class.
 *
 * GET returns the draft plus everything the panel needs to render without a
 * second round trip: the class facts, the tags currently on it, and the tag
 * registry with aliases.
 *
 * PATCH saves the draft. It is partial by design, the same as the wrap-up
 * PATCH: the teacher writes the metadata on one visit, goes and uploads, and
 * comes back days later to set the status. Neither visit should have to restate
 * the other's fields.
 *
 * Saving with status 'published' re-runs the class-to-Library sync, which is
 * what carries the title, description, search terms, category, language, exam
 * and level onto the library_videos row a student actually searches.
 */

interface Ctx {
  params: { classId: string };
}

/** Fields PATCH is allowed to touch. Anything else in the body is ignored. */
const WRITABLE = [
  'yt_title',
  'yt_description',
  'yt_tags',
  'chapters',
  'search_terms',
  'language',
  'exam',
  'difficulty',
  'category',
  'thumbnail_url',
  'status',
] as const;

/**
 * GET /api/timetable/[classId]/video-meta  (staff)
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<VideoMetaClass>(
      supabase, msUser.oid, params.classId, VIDEO_META_CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can prepare a recording' }, { status: 403 });
    }

    const [metaRes, classTagsRes, registryRes, tutorRes] = await Promise.all([
      supabase
        .from('nexus_class_video_meta')
        .select(VIDEO_META_COLS)
        .eq('scheduled_class_id', params.classId)
        .maybeSingle(),
      supabase
        .from('nexus_class_tags')
        .select('tag:nexus_qb_tags(id, slug, label, group_type, color)')
        .eq('scheduled_class_id', params.classId),
      // Aliases come along because the prompt shows them to the AI, which is how
      // "vanishing point" gets mapped onto the canonical Perspective tag instead
      // of becoming a fourth spelling of the same topic.
      supabase
        .from('nexus_qb_tags')
        .select('id, slug, label, group_type, color, aliases')
        .in('group_type', ['subject', 'theme', 'exam'])
        .eq('is_active', true)
        .order('group_type', { ascending: true })
        .order('sort_order', { ascending: true }),
      access.cls.teacher_id
        ? supabase.from('users').select('name').eq('id', access.cls.teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
      class: access.cls,
      tutorName: tutorRes?.data?.name || null,
      meta: metaRes?.data || null,
      tags: (classTagsRes?.data || []).map((r: any) => r.tag).filter(Boolean),
      registry: registryRes?.data || [],
      canEdit: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the video metadata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/timetable/[classId]/video-meta  (staff)
 *
 * Body, all optional: the WRITABLE fields above, plus `tag_ids` to replace the
 * class's topic tags in one go.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<VideoMetaClass>(
      supabase, msUser.oid, params.classId, VIDEO_META_CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can prepare a recording' }, { status: 403 });
    }

    // The teacher edits every field after the AI produced it, so what arrives
    // here is not what the paste validator saw. This is the last gate before
    // anything reaches YouTube or a student.
    const problems = validateVideoMetaPatch(body);
    if (problems.length) {
      return NextResponse.json({ error: problems[0], errors: problems }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const field of WRITABLE) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (field === 'yt_tags' || field === 'search_terms') {
        patch[field] = Array.isArray(value)
          ? [...new Set(value.map((v: unknown) => String(v ?? '').trim()).filter(Boolean))].slice(0, 40)
          : [];
      } else if (field === 'chapters') {
        patch[field] = Array.isArray(value) ? value.slice(0, 60) : [];
      } else if (typeof value === 'string') {
        patch[field] = value.trim() || null;
      } else {
        patch[field] = value ?? null;
      }
    }

    if (body.generated === true) {
      patch.generated_at = new Date().toISOString();
      patch.generated_by = access.userId;
    }

    // The last step of the panel is pasting the URL of the video that was just
    // uploaded, so it writes youtube_url through the same validator the wrap-up
    // and Class Day screens use. That canonicalises youtu.be and /shorts/ forms
    // to one watch URL, which is what keeps the Library dedupe honest.
    if (body.youtube_url !== undefined) {
      const links = buildClassLinkPatch({ youtube_url: body.youtube_url });
      if (!links.ok) return NextResponse.json({ error: links.error }, { status: 400 });
      if (Object.keys(links.patch).length > 0) {
        const { error } = await supabase
          .from('nexus_scheduled_classes')
          .update(links.patch)
          .eq('id', params.classId);
        if (error) throw error;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      // Upsert on the unique class id: the first save creates the row, later
      // ones update it, with no separate "does a draft exist" round trip.
      const { error } = await supabase
        .from('nexus_class_video_meta')
        .upsert({ scheduled_class_id: params.classId, ...patch }, { onConflict: 'scheduled_class_id' });
      if (error) throw error;
    }

    // Topic tags live in nexus_class_tags against the canonical registry, not on
    // the meta row, so there is one vocabulary. Replaced wholesale: the picker
    // sends the complete set.
    if (Array.isArray(body.tag_ids)) {
      const ids = [...new Set(body.tag_ids.map((t: unknown) => String(t)).filter(Boolean))].slice(0, 12);
      await supabase.from('nexus_class_tags').delete().eq('scheduled_class_id', params.classId);
      if (ids.length > 0) {
        const { error } = await supabase
          .from('nexus_class_tags')
          .insert(ids.map((tag_id) => ({ scheduled_class_id: params.classId, tag_id })));
        if (error) {
          return NextResponse.json(
            { error: 'Saved, but one of those tags no longer exists. Pick them again.' },
            { status: 409 },
          );
        }
      }
    }

    // Once the video is live the metadata has to reach the Library, otherwise
    // everything above is a document nobody can search. Best-effort: a Library
    // hiccup must not lose the teacher's work.
    let librarySynced = false;
    if (body.status === 'published' || body.youtube_url) {
      try {
        librarySynced = Boolean(await syncClassToLibrary(supabase, params.classId));
      } catch (bridgeErr) {
        console.error('Class -> Library sync failed:', bridgeErr);
      }
    }

    const { data: meta } = await supabase
      .from('nexus_class_video_meta')
      .select(VIDEO_META_COLS)
      .eq('scheduled_class_id', params.classId)
      .maybeSingle();

    return NextResponse.json({ meta, librarySynced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save the video metadata';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

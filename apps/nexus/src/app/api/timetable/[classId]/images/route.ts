import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession, isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';

/**
 * Images from a class.
 *
 * Teachers used to post the "what we did today" screenshots into the Teams
 * chat, where they are hard to find later. This keeps them on the class itself:
 * staff attach them (paste / drop / choose), enrolled students see the gallery,
 * and the summarizer feeds them to the model as extra signal for a drawing class.
 *
 * One of them is the COVER (nexus_scheduled_classes.cover_image_id), the picture
 * shown in front of the class everywhere it is listed. The teacher stars it here
 * via PATCH; when nobody stars anything the reader falls back to the first image.
 *
 * Images live in the existing public `drawing-references` bucket under a
 * per-class path; each one is a row in nexus_class_images. Each upload may carry
 * a browser-made `thumb` alongside it, a small copy for those tiles, so a
 * student scanning a week does not download multi-megabyte originals.
 */

interface Ctx {
  params: { classId: string };
}

const BUCKET = 'drawing-references';

/**
 * Hard ceiling per class, enforced here because `maxFiles` in the editor is
 * client-side only. The gallery now rides along on every week payload, so an
 * unbounded class would inflate the most-requested response in the app.
 */
const MAX_IMAGES_PER_CLASS = 12;

const IMAGE_COLS = 'id, url, thumb_url, caption, sort_order, source, created_at';

async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, teacher_id, cover_image_id')
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

  // Internal staff reach any classroom without being enrolled in it; that is
  // the point of the tier. Everyone else must hold an active enrollment.
  const internal = isInternalStaff(resolveStaffRole(user));
  if (!enrollment && !internal) {
    return { error: NextResponse.json({ error: 'Not enrolled' }, { status: 403 }) };
  }
  // Internal staff may act on any class; an external teacher only on the
  // classes they are the tutor of. See canRunSession.
  const canEdit = canRunSession(user, cls.teacher_id);
  return { userId: user.id as string, canEdit, cls };
}

/**
 * The gallery in display order.
 *
 * sortClassImages in lib/class-cover.ts MUST order identically, because it is
 * what picks the fallback cover for every list view. If the two disagree, the
 * timetable shows a different picture from the first thumb here and the star
 * looks broken.
 */
async function listImages(supabase: any, classId: string) {
  const { data } = await supabase
    .from('nexus_class_images')
    .select(IMAGE_COLS)
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return data || [];
}

/** GET: the gallery and which image is starred (staff and enrolled students). */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    return NextResponse.json({
      images: await listImages(supabase, params.classId),
      canEdit: access.canEdit,
      cover_image_id: access.cls.cover_image_id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: upload one image (staff). multipart form-data { file, thumb? }.
 *
 * `thumb` is the browser's downscaled copy. It is optional on purpose: an old
 * browser, a failed canvas encode, or an already-tiny source all skip it, and
 * the reader falls back to the full-size url.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can add class images' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });

    const { count } = await supabase
      .from('nexus_class_images')
      .select('id', { count: 'exact', head: true })
      .eq('scheduled_class_id', params.classId);
    if ((count ?? 0) >= MAX_IMAGES_PER_CLASS) {
      return NextResponse.json(
        { error: `A class can hold ${MAX_IMAGES_PER_CLASS} images. Remove one to add another.` },
        { status: 400 },
      );
    }

    const stamp = Date.now();
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const filePath = `class/${params.classId}/${stamp}.${ext}`;
    let contentType = file.type || 'image/jpeg';
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const url = urlData.publicUrl;

    // The thumbnail is a nicety, so a failure here must not lose the upload the
    // teacher already made. Fall through with no thumb instead of throwing.
    let thumbUrl: string | null = null;
    let thumbPath: string | null = null;
    const thumb = formData.get('thumb') as File | null;
    if (thumb && thumb.size > 0) {
      const thumbExt = thumb.type === 'image/jpeg' ? 'jpg' : 'webp';
      const candidatePath = `class/${params.classId}/${stamp}_thumb.${thumbExt}`;
      const thumbBuffer = new Uint8Array(await thumb.arrayBuffer());
      const { error: thumbError } = await supabase.storage
        .from(BUCKET)
        .upload(candidatePath, thumbBuffer, { contentType: thumb.type || 'image/webp', upsert: false });
      if (thumbError) {
        console.error('Class image thumbnail upload failed:', thumbError.message);
      } else {
        thumbPath = candidatePath;
        thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(candidatePath).data.publicUrl;
      }
    }

    // Next sort_order after the current max.
    const { data: last } = await supabase
      .from('nexus_class_images')
      .select('sort_order')
      .eq('scheduled_class_id', params.classId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = (last?.sort_order ?? -1) + 1;

    const { data: row, error } = await supabase
      .from('nexus_class_images')
      .insert({
        scheduled_class_id: params.classId,
        url,
        storage_path: filePath,
        thumb_url: thumbUrl,
        thumb_path: thumbPath,
        sort_order,
        source: 'upload',
        created_by: access.userId,
      })
      .select(IMAGE_COLS)
      .single();
    if (error) throw error;

    return NextResponse.json({ image: row, url, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Class image upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH: star one image as the class cover, or clear it (staff).
 *
 * Body { cover_image_id: string | null }.
 *
 * This lives here rather than on the wrap-up PATCH because the wrap-up is a form
 * save: starring would then need a Save press, and the star would lie until the
 * teacher pressed it.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can choose the class cover' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const coverImageId = body?.cover_image_id ?? null;

    if (coverImageId !== null) {
      if (typeof coverImageId !== 'string') {
        return NextResponse.json({ error: 'cover_image_id must be an image id or null' }, { status: 400 });
      }
      // Scoped to THIS class, so a teacher cannot point one class at another
      // class's picture (the FK alone would happily allow it).
      const { data: owned } = await supabase
        .from('nexus_class_images')
        .select('id')
        .eq('id', coverImageId)
        .eq('scheduled_class_id', params.classId)
        .maybeSingle();
      if (!owned) {
        return NextResponse.json({ error: 'That image is not on this class' }, { status: 404 });
      }
    }

    const { error } = await supabase
      .from('nexus_scheduled_classes')
      .update({ cover_image_id: coverImageId })
      .eq('id', params.classId);
    if (error) throw error;

    return NextResponse.json({ ok: true, cover_image_id: coverImageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set the cover';
    console.error('Class cover update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: remove one image (staff). ?id= or ?url=
 *
 * Prefer ?id=. The ?url= branch is kept for older callers, but it cannot tell
 * two rows apart if they ever share a url.
 *
 * Nothing here clears cover_image_id: the FK does it (ON DELETE SET NULL), so
 * deleting the starred picture cannot leave a dangling cover.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can remove class images' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const url = searchParams.get('url');
    if (!id && !url) return NextResponse.json({ error: 'Pass id or url' }, { status: 400 });

    let query = supabase
      .from('nexus_class_images')
      .select('id, storage_path, thumb_path')
      .eq('scheduled_class_id', params.classId);
    query = id ? query.eq('id', id) : query.eq('url', url);
    const { data: row } = await query.maybeSingle();
    if (!row) return NextResponse.json({ ok: true });

    await supabase.from('nexus_class_images').delete().eq('id', row.id);
    const objects = [row.storage_path, row.thumb_path].filter(Boolean) as string[];
    if (objects.length) {
      await supabase.storage.from(BUCKET).remove(objects).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Drawings made during a class.
 *
 * Teachers used to post the "what we drew today" screenshots into the Teams
 * chat, where they are hard to find later. This keeps them on the class itself:
 * staff attach them (paste / drop / choose), enrolled students see the gallery,
 * and the summarizer feeds them to the model as extra signal for a drawing class.
 *
 * Images live in the existing public `drawing-references` bucket under a
 * per-class path; each one is a row in nexus_class_images.
 */

interface Ctx {
  params: { classId: string };
}

const BUCKET = 'drawing-references';

async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id')
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

async function listImages(supabase: any, classId: string) {
  const { data } = await supabase
    .from('nexus_class_images')
    .select('id, url, caption, sort_order, source')
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return data || [];
}

/** GET: the gallery (staff and enrolled students). */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;

    return NextResponse.json({ images: await listImages(supabase, params.classId), canEdit: access.canEdit });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST: upload one drawing (staff). multipart form-data { file }. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can add class drawings' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const filePath = `class/${params.classId}/${Date.now()}.${ext}`;
    let contentType = file.type || 'image/jpeg';
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const url = urlData.publicUrl;

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
        sort_order,
        source: 'upload',
        created_by: access.userId,
      })
      .select('id, url, caption, sort_order, source')
      .single();
    if (error) throw error;

    return NextResponse.json({ image: row, url, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Class image upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE: remove one drawing (staff). ?id= or ?url= */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can remove class drawings' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const url = searchParams.get('url');
    if (!id && !url) return NextResponse.json({ error: 'Pass id or url' }, { status: 400 });

    let query = supabase.from('nexus_class_images').select('id, storage_path').eq('scheduled_class_id', params.classId);
    query = id ? query.eq('id', id) : query.eq('url', url);
    const { data: row } = await query.maybeSingle();
    if (!row) return NextResponse.json({ ok: true });

    await supabase.from('nexus_class_images').delete().eq('id', row.id);
    if (row.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

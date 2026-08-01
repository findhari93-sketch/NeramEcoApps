import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  createFileRecord,
  getNextSortOrder,
} from '@neram/database';
import {
  uploadToSharePoint,
  resolveShareUrlToItem,
  createViewLink,
  getSharePointThumbnailUrl,
} from '@/lib/sharepoint';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { extractYouTubeId } from '@/lib/youtube';
import {
  RESOURCE_COLS,
  MAX_RESOURCES_PER_CLASS,
  MAX_TITLE_LENGTH,
  MAX_NOTE_LENGTH,
  CLASS_RESOURCE_FOLDER_ID,
  cleanText,
  detectResourceKind,
  displayHost,
  isSharePointUrl,
  youtubeThumb,
  youtubeWatchUrl,
} from '@/lib/class-resources';

/**
 * Reference material on one class.
 *
 * The teacher's optional "look at this to understand the topic" list: an
 * explainer video, a worked-example PDF, a reference image, a web link. Students
 * read it; only staff who can run the class may change it.
 *
 * Storage reuses the two pipelines that already exist rather than inventing a
 * third. Images go to the public `drawing-references` bucket under the same
 * per-class path class images use. PDFs go through the study-materials pipeline
 * into a system folder, which is what earns them the secure reader, the
 * watermark and no download button; see the folder created in
 * 20260806090000_nexus_class_resources.sql.
 */

interface Ctx {
  params: { classId: string };
}

const BUCKET = 'drawing-references';
const CLASS_COLS = 'id, classroom_id, teacher_id, title, scheduled_date';
const LIBRARY_LIMIT = 30;

interface ResourceClass {
  id: string;
  classroom_id: string;
  teacher_id: string | null;
  title: string;
  scheduled_date: string;
}

async function listResources(supabase: any, classId: string) {
  const { data } = await supabase
    .from('nexus_class_resources')
    .select(RESOURCE_COLS)
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return data || [];
}

/**
 * Title and thumbnail for a pasted video, resolved ONCE at insert time.
 *
 * oEmbed is keyless and free, and this is never called on a read, so a class
 * viewed a thousand times costs a thousand zero outbound requests. Any failure
 * (private video, network, timeout) falls through to the caller's typed title
 * and the deterministic thumbnail, so a YouTube outage degrades the label and
 * never the save.
 */
async function resolveYouTubeMeta(videoId: string): Promise<{ title: string | null; thumb: string | null }> {
  try {
    const target = encodeURIComponent(youtubeWatchUrl(videoId));
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { title: null, thumb: null };
    const data: any = await res.json();
    return {
      title: typeof data?.title === 'string' ? data.title : null,
      thumb: typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null,
    };
  } catch {
    return { title: null, thumb: null };
  }
}

/** Next sort_order after the current max, so a new item lands at the bottom. */
async function nextSortOrder(supabase: any, classId: string): Promise<number> {
  const { data: last } = await supabase
    .from('nexus_class_resources')
    .select('sort_order')
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.sort_order ?? -1) + 1;
}

async function assertRoom(supabase: any, classId: string): Promise<NextResponse | null> {
  const { count } = await supabase
    .from('nexus_class_resources')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_class_id', classId);
  if ((count ?? 0) >= MAX_RESOURCES_PER_CLASS) {
    return NextResponse.json(
      { error: `A class can hold ${MAX_RESOURCES_PER_CLASS} pieces of reference material. Remove one to add another.` },
      { status: 400 },
    );
  }
  return null;
}

/**
 * GET: the list (staff and enrolled students).
 *
 * `?library=1&q=` instead returns candidates for the "Add from another class"
 * picker: this teacher's own recent material, newest first, excluding anything
 * already on this class. Indexed on (created_by, created_at DESC), so it never
 * scans the table.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<ResourceClass>(
      supabase, msUser.oid, params.classId, CLASS_COLS,
    );
    if ('error' in access) return access.error;

    const { searchParams } = new URL(request.url);
    if (searchParams.get('library') === '1') {
      if (!access.canEdit) {
        return NextResponse.json({ error: 'Only staff can browse past material' }, { status: 403 });
      }
      const q = (searchParams.get('q') || '').trim();

      let query = supabase
        .from('nexus_class_resources')
        .select(`${RESOURCE_COLS}, cls:nexus_scheduled_classes!inner(id, title, scheduled_date)`)
        .eq('created_by', access.userId)
        .neq('scheduled_class_id', params.classId)
        .order('created_at', { ascending: false })
        .limit(LIBRARY_LIMIT);
      // Escape the PostgREST wildcards so a title with % or _ searches literally.
      if (q) query = query.ilike('title', `%${q.replace(/[%_]/g, '\\$&')}%`);

      const { data } = await query;
      return NextResponse.json({ candidates: data || [] });
    }

    return NextResponse.json({
      resources: await listResources(supabase, params.classId),
      canEdit: access.canEdit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reference material';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: add one piece of material (staff only). Three shapes, one route:
 *
 *   JSON      { url, title?, note? }        a video or a web link
 *   JSON      { copy_from }                 reuse something from another class
 *   multipart { file, thumb?, title?, note? }  an image or a PDF
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<ResourceClass>(
      supabase, msUser.oid, params.classId, CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can add reference material' }, { status: 403 });
    }

    const full = await assertRoom(supabase, params.classId);
    if (full) return full;

    const contentType = request.headers.get('content-type') || '';
    const isMultipart = contentType.includes('multipart/form-data');

    const base = {
      scheduled_class_id: params.classId,
      sort_order: await nextSortOrder(supabase, params.classId),
      created_by: access.userId,
    };

    let row: Record<string, unknown>;

    if (isMultipart) {
      row = await buildFromUpload(request, supabase, params.classId, authHeader, base);
    } else {
      const body = await request.json().catch(() => ({}));
      if (body?.copy_from) {
        row = await buildFromCopy(supabase, access.userId, String(body.copy_from), base);
      } else if (body?.sharepoint_item_id || isSharePointUrl(body?.url)) {
        row = await buildFromSharePoint(body, base);
      } else {
        row = await buildFromUrl(body, base);
      }
    }

    const { data: created, error } = await supabase
      .from('nexus_class_resources')
      .insert(row)
      .select(RESOURCE_COLS)
      .single();
    if (error) throw error;

    return NextResponse.json({ resource: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add that';
    const status = /^(Only|Missing|That|Paste|Pick|Reference)/.test(message) ? 400 : 500;
    if (status === 500) console.error('Class resource create error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}

/** A pasted link: a YouTube video, or any other http(s) address. */
async function buildFromUrl(body: any, base: Record<string, unknown>) {
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) throw new Error('Paste a link, or choose a file');

  const typed = cleanText(body?.title, MAX_TITLE_LENGTH);
  const note = cleanText(body?.note, MAX_NOTE_LENGTH);
  const kind = detectResourceKind(rawUrl);

  if (kind === 'youtube') {
    const videoId = extractYouTubeId(rawUrl) as string;
    const meta = await resolveYouTubeMeta(videoId);
    return {
      ...base,
      kind: 'youtube',
      // The teacher's own words win: if they named it, oEmbed does not overrule.
      title: typed || meta.title || 'YouTube video',
      note,
      url: youtubeWatchUrl(videoId),
      thumb_url: meta.thumb || youtubeThumb(videoId),
    };
  }

  if (kind === 'link') {
    return {
      ...base,
      kind: 'link',
      title: typed || displayHost(rawUrl) || 'Link',
      note,
      url: rawUrl,
    };
  }

  throw new Error('That does not look like a web address. Links must start with http or https.');
}

/**
 * A file that already lives in SharePoint: linked, never copied.
 *
 * This is how a PowerPoint gets attached. Two ways in, one result:
 *
 *   { sharepoint_item_id, name, ... }  picked out of the search dialog
 *   { url }                            a share link pasted by hand
 *
 * It becomes a study_file row, exactly like an uploaded PDF, which is what earns
 * it the secure reader, the per-student watermark and no download button. A deck
 * is converted to PDF on the way out (see lib/office-rendition); nothing about
 * that decision belongs here.
 *
 * Deliberately NOT copied into our own library. The teacher keeps editing the
 * deck in SharePoint and every student sees the current version, which is the
 * behaviour people expect from a link and the reason not to duplicate the bytes.
 */
async function buildFromSharePoint(body: any, base: Record<string, unknown>) {
  const typed = cleanText(body?.title, MAX_TITLE_LENGTH);
  const note = cleanText(body?.note, MAX_NOTE_LENGTH);

  let itemId: string | null = body?.sharepoint_item_id ? String(body.sharepoint_item_id) : null;
  let name: string = typeof body?.name === 'string' ? body.name : '';
  let mimeType: string | null = typeof body?.mime_type === 'string' ? body.mime_type : null;
  let size: number | null = typeof body?.size === 'number' ? body.size : null;
  // Set only for a pasted link, whose file may live on a drive the single-site
  // item id cannot reach. The content proxy resolves it through /shares instead.
  let linkUrl: string | null = null;
  let webUrl: string | null = null;

  if (!itemId) {
    const pasted = String(body?.url || '').trim();
    if (!pasted) throw new Error('Paste a link, or choose a file');
    const resolved = await resolveShareUrlToItem(pasted);
    itemId = resolved.id;
    name = resolved.name;
    mimeType = resolved.mimeType;
    size = resolved.size;
    linkUrl = pasted;
    webUrl = pasted;
  } else {
    // Picked from our own library, so a read-only organisation link can be minted
    // for the "Open in SharePoint" action. view scope is the guarantee that a
    // student following it cannot edit the deck.
    webUrl = (await createViewLink(itemId).catch(() => null)) || (body?.web_url ?? null);
  }

  const fallbackTitle = (name || 'Reference').replace(/\.[^.]+$/, '') || 'Reference';

  // A nicety only: a failure must not lose the attachment the teacher just made.
  const thumb = itemId ? await getSharePointThumbnailUrl(itemId, 'medium').catch(() => null) : null;

  const record: any = await createFileRecord({
    folder_id: CLASS_RESOURCE_FOLDER_ID,
    title: typed || fallbackTitle,
    file_name: name || 'file',
    file_type: mimeType || 'application/octet-stream',
    file_size_bytes: size ?? 0,
    // An uploaded file carries an item id; a pasted one carries a link. The
    // content proxy already branches on exactly this pair.
    sharepoint_item_id: linkUrl ? null : itemId,
    sharepoint_web_url: webUrl,
    link_url: linkUrl,
    // null means "inherit the folder", and the folder is allow_download=false,
    // so a student reads it in the viewer and cannot save a copy.
    allow_download: null,
    sort_order: await getNextSortOrder({ files: CLASS_RESOURCE_FOLDER_ID }),
    uploaded_by: base.created_by as string,
  });

  return {
    ...base,
    kind: 'study_file',
    title: typed || fallbackTitle,
    note,
    study_file_id: record.id,
    thumb_url: thumb,
  };
}

/** Reuse: duplicate a row this teacher created on another class. */
async function buildFromCopy(
  supabase: any,
  userId: string,
  sourceId: string,
  base: Record<string, unknown>,
) {
  const { data: source } = await supabase
    .from('nexus_class_resources')
    .select('id, kind, title, note, url, thumb_url, study_file_id, storage_path, created_by')
    .eq('id', sourceId)
    .maybeSingle();
  if (!source) throw new Error('That material no longer exists');
  if (source.created_by !== userId) {
    throw new Error('You can only reuse material you added yourself');
  }

  return {
    ...base,
    kind: source.kind,
    title: source.title,
    note: source.note,
    url: source.url,
    thumb_url: source.thumb_url,
    study_file_id: source.study_file_id,
    // storage_path is deliberately NOT copied: both rows would point at one
    // object, and deleting either would break the other's image.
    source_resource_id: source.id,
  };
}

/** An uploaded file: image to Supabase, PDF to the study-materials pipeline. */
async function buildFromUpload(
  request: NextRequest,
  supabase: any,
  classId: string,
  authHeader: string | null,
  base: Record<string, unknown>,
) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new Error('Missing file');

  const typed = cleanText(formData.get('title'), MAX_TITLE_LENGTH);
  const note = cleanText(formData.get('note'), MAX_NOTE_LENGTH);
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '') || 'Reference';

  if (file.type === 'application/pdf') {
    const graphToken = extractBearerToken(authHeader);
    if (!graphToken) throw new Error('Missing or invalid Authorization header');

    const storagePath = `nexus/study-materials/${CLASS_RESOURCE_FOLDER_ID}/${Date.now()}-${file.name
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80)}`;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadToSharePoint(graphToken, storagePath, buffer, file.type);

    const record: any = await createFileRecord({
      folder_id: CLASS_RESOURCE_FOLDER_ID,
      title: typed || fallbackTitle,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      sharepoint_item_id: uploaded.itemId,
      sharepoint_web_url: uploaded.webUrl,
      storage_path: storagePath,
      // null means "inherit the folder", and the folder is allow_download=false,
      // so a student reads it in the viewer and cannot save a copy.
      allow_download: null,
      sort_order: await getNextSortOrder({ files: CLASS_RESOURCE_FOLDER_ID }),
      uploaded_by: base.created_by as string,
    });

    return {
      ...base,
      kind: 'study_file',
      title: typed || fallbackTitle,
      note,
      study_file_id: record.id,
    };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Only images and PDFs can be attached. Paste a link for anything else.');
  }

  const stamp = Date.now();
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const filePath = `class/${classId}/res-${stamp}.${ext}`;
  const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  const url = supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;

  // The thumbnail is a nicety: a failure must not lose the upload the teacher
  // already made, so fall through with no thumb rather than throwing.
  let thumbUrl: string | null = null;
  const thumb = formData.get('thumb') as File | null;
  if (thumb && thumb.size > 0) {
    const thumbExt = thumb.type === 'image/jpeg' ? 'jpg' : 'webp';
    const thumbPath = `class/${classId}/res-${stamp}_thumb.${thumbExt}`;
    const thumbBuffer = new Uint8Array(await thumb.arrayBuffer());
    const { error: thumbError } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumbBuffer, { contentType: thumb.type || 'image/webp', upsert: false });
    if (thumbError) console.error('Resource thumbnail upload failed:', thumbError.message);
    else thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;
  }

  return {
    ...base,
    kind: 'image',
    title: typed || fallbackTitle,
    note,
    url,
    storage_path: filePath,
    thumb_url: thumbUrl,
  };
}

/**
 * PATCH: rename or annotate one item, or reorder the whole list (staff only).
 *
 * Body { id, title?, note? } or { order: [id, ...] }.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<ResourceClass>(
      supabase, msUser.oid, params.classId, CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can change reference material' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (Array.isArray(body?.order)) {
      const ids = body.order.map((id: unknown) => String(id)).slice(0, MAX_RESOURCES_PER_CLASS);
      // Scoped to this class on every write, so a crafted list cannot reorder
      // (or touch) another class's rows.
      await Promise.all(
        ids.map((id: string, index: number) =>
          supabase
            .from('nexus_class_resources')
            .update({ sort_order: index })
            .eq('id', id)
            .eq('scheduled_class_id', params.classId),
        ),
      );
      return NextResponse.json({ resources: await listResources(supabase, params.classId) });
    }

    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id) return NextResponse.json({ error: 'Pass an id, or an order array' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = cleanText(body.title, MAX_TITLE_LENGTH);
      if (!title) return NextResponse.json({ error: 'A title cannot be empty' }, { status: 400 });
      patch.title = title;
    }
    if (body.note !== undefined) patch.note = cleanText(body.note, MAX_NOTE_LENGTH);
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('nexus_class_resources')
      .update(patch)
      .eq('id', id)
      .eq('scheduled_class_id', params.classId)
      .select(RESOURCE_COLS)
      .maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: 'That is not on this class' }, { status: 404 });

    return NextResponse.json({ resource: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save that';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: remove one item (staff only). ?id=
 *
 * The study file behind a PDF is left alone on purpose: it lives in the shared
 * library and another class may have reused it. Only the Supabase object, which
 * belongs to exactly one row, is cleaned up.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<ResourceClass>(
      supabase, msUser.oid, params.classId, CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can remove reference material' }, { status: 403 });
    }

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Pass id' }, { status: 400 });

    const { data: row } = await supabase
      .from('nexus_class_resources')
      .select('id, storage_path')
      .eq('id', id)
      .eq('scheduled_class_id', params.classId)
      .maybeSingle();
    if (!row) return NextResponse.json({ ok: true });

    await supabase.from('nexus_class_resources').delete().eq('id', row.id);
    if (row.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove that';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

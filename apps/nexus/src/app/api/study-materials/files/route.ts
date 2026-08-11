import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { uploadToSharePoint, resolveShareUrlToItem } from '@/lib/sharepoint';
import { getFolderById, createFileRecord, getNextSortOrder } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * POST /api/study-materials/files  (staff)
 *
 * Two request shapes, told apart by content type:
 *   multipart/form-data  { folder_id, file, title?, allow_download? }
 *     Uploads the bytes to SharePoint and records the result.
 *   application/json     { folder_id, url, title?, allow_download? }
 *     Links an EXISTING SharePoint/OneDrive file by its share URL (from
 *     DriveFilePickerDialog) instead of copying it. Same "link, don't copy"
 *     pattern as /api/assignments/link-document: resolveShareUrlToItem
 *     validates the link server-side and the row stores link_url, so the
 *     content route streams it fresh from the source drive on every read.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return linkExistingFile(request);
  }
  return uploadNewFile(request);
}

async function linkExistingFile(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json();
    const folderId = String(body?.folder_id || '').trim();
    const url = String(body?.url || '').trim();
    const title = String(body?.title || '').trim();
    if (!folderId) return NextResponse.json({ error: 'Missing folder_id' }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Pick a valid OneDrive/SharePoint file.' }, { status: 400 });
    }

    const folder = await getFolderById(folderId);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const item = await resolveShareUrlToItem(url);

    let allowDownload: boolean | null = null;
    if (body?.allow_download === true) allowDownload = true;
    else if (body?.allow_download === false) allowDownload = false;

    const sortOrder = await getNextSortOrder({ files: folderId });

    const record = await createFileRecord({
      folder_id: folderId,
      title: title || item.name.replace(/\.[^.]+$/, ''),
      file_name: item.name,
      file_type: item.mimeType,
      file_size_bytes: item.size,
      sharepoint_item_id: item.id,
      sharepoint_web_url: url,
      link_url: url,
      allow_download: allowDownload,
      sort_order: sortOrder,
      uploaded_by: user.id,
    });

    return NextResponse.json({ file: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not link that file';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function uploadNewFile(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const token = extractBearerToken(request.headers.get('Authorization'))!;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderId = formData.get('folder_id') as string | null;
    const title = (formData.get('title') as string | null)?.trim();
    const allowDownloadRaw = formData.get('allow_download');

    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    if (!folderId) return NextResponse.json({ error: 'Missing folder_id' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF and image files are allowed' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 });
    }

    const folder = await getFolderById(folderId);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const timestamp = Date.now();
    const storagePath = `nexus/study-materials/${folderId}/${timestamp}-${sanitize(file.name)}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const result = await uploadToSharePoint(token, storagePath, buffer, file.type);

    // allow_download override: 'true'/'false'/'inherit'(absent) -> boolean | null
    let allowDownload: boolean | null = null;
    if (allowDownloadRaw === 'true') allowDownload = true;
    else if (allowDownloadRaw === 'false') allowDownload = false;

    // Append to the end of the folder so a fresh upload does not jump to the top.
    const sortOrder = await getNextSortOrder({ files: folderId });

    const record = await createFileRecord({
      folder_id: folderId,
      title: title || file.name.replace(/\.[^.]+$/, ''),
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      sharepoint_item_id: result.itemId,
      sharepoint_web_url: result.webUrl,
      storage_path: storagePath,
      allow_download: allowDownload,
      sort_order: sortOrder,
      uploaded_by: user.id,
    });

    return NextResponse.json({ file: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

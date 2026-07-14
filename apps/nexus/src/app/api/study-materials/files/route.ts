import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { uploadToSharePoint } from '@/lib/sharepoint';
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
 * Multipart upload: { folder_id, file, title?, allow_download? }.
 * Uploads the file to SharePoint and records it in nexus_study_files.
 */
export async function POST(request: NextRequest) {
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

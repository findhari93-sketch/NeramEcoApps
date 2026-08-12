/**
 * Put a data: URI into storage, server side, and hand back its URL.
 *
 * The paper JSON exports absolute URLs, so a downloaded-then-edited file
 * normally carries nothing to upload. But an AI-generated file does: the
 * bulk-upload prompt has always allowed inline base64, and the import route now
 * accepts those files directly rather than only through the wizard.
 *
 * The wizard's own uploader (upload-base64-images.ts) cannot be reused here.
 * It runs in the browser, uses atob and File, and posts to
 * /api/question-bank/upload-image with the teacher's token. It also only ever
 * handled the question and option slots, never the solution image, which is one
 * of the holes this schema exists to close.
 *
 * Bucket, path convention and size limit are deliberately identical to
 * api/question-bank/upload-image/route.ts. If that route changes, change this
 * with it: two different paths for the same image would make the backlog
 * screens disagree about which questions have figures.
 */

import { getSupabaseAdminClient, rewriteStorageUrl } from '@neram/database';

const BUCKET = 'uploads';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isDataUri(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

/**
 * Store one data: URI and return its public URL.
 *
 * Returns null rather than throwing when the payload is unusable. A single
 * malformed image should cost that image, not the other 91 questions in the
 * file, and the caller reports the loss in the import summary.
 */
export async function storeDataUri(
  dataUri: string,
  opts: { userId: string; subfolder: string },
): Promise<string | null> {
  const comma = dataUri.indexOf(',');
  if (comma === -1) return null;

  const header = dataUri.slice(0, comma);
  const mime = /^data:([^;,]+)/.exec(header)?.[1] ?? 'image/png';
  if (!ALLOWED.has(mime)) return null;
  if (!/;base64/i.test(header)) return null;

  // AI tools routinely wrap base64 across lines. Buffer tolerates that, but
  // stripping first keeps the length check honest.
  const cleaned = dataUri.slice(comma + 1).replace(/\s/g, '');
  if (!cleaned) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;

  const ext = mime.split('/')[1] || 'png';
  const filePath = `nexus/question-bank/${opts.userId}/${opts.subfolder}/${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: mime, upsert: false });
  if (error) {
    console.error('[paper import] storing an image failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return rewriteStorageUrl(data.publicUrl) || data.publicUrl;
}

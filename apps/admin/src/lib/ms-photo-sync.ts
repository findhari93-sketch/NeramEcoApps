// @ts-nocheck
/**
 * Microsoft profile photo sync.
 *
 * Pulls each user's Microsoft Graph profile photo (app-only) into our own
 * Storage and records it in the user_avatars history with source='microsoft'.
 * The avatar shown across every app is users.avatar_url, which createUserAvatar
 * updates to the newest photo, so a successful sync lights up every avatar with
 * zero per-render Graph calls.
 *
 * "Latest wins" with dedupe: a Microsoft photo is only (re)stored when its
 * content hash differs from the user's last stored Microsoft photo, so a repeat
 * sync never clobbers a more-recent user upload.
 */
import { createHash } from 'crypto';
import { getSupabaseAdminClient, createUserAvatar, getLatestMsAvatarHash } from '@neram/database';
import { getUserPhoto, checkGraphConnection } from '@neram/auth';

/** Run an async fn over items with a bounded concurrency. */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export type MsPhotoSyncStatus = 'synced' | 'unchanged' | 'no_photo' | 'no_oid' | 'error';

/**
 * Fetch one user's Microsoft photo and store it if new/changed. Best-effort:
 * returns a status rather than throwing so a bulk run never aborts on one user.
 */
export async function syncUserMsPhoto(
  supabase: any,
  user: { id: string; ms_oid?: string | null; name?: string | null },
): Promise<{ status: MsPhotoSyncStatus; message?: string }> {
  if (!user?.ms_oid) return { status: 'no_oid' };

  try {
    const photo = await getUserPhoto(user.ms_oid);
    if (!photo || !photo.buffer || photo.buffer.length === 0) return { status: 'no_photo' };

    const hash = createHash('sha256').update(photo.buffer).digest('hex');
    const prevHash = await getLatestMsAvatarHash(user.id, supabase);
    if (prevHash && prevHash === hash) return { status: 'unchanged' };

    const ext = (photo.contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    // Public `documents` bucket, same one the alumni offboarding capture uses.
    const path = `ms-avatars/${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, photo.buffer, { contentType: photo.contentType, upsert: false });
    if (upErr) return { status: 'error', message: upErr.message || 'upload failed' };

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) return { status: 'error', message: 'no public url' };

    await createUserAvatar(
      user.id,
      {
        storage_path: publicUrl,
        file_name: `microsoft-photo.${ext}`,
        mime_type: photo.contentType,
        source: 'microsoft',
        content_hash: hash,
      },
      supabase,
    );

    return { status: 'synced' };
  } catch (err: any) {
    return { status: 'error', message: err?.message || String(err) };
  }
}

export interface MsPhotoSyncSummary {
  total: number;
  synced: number;
  unchanged: number;
  noPhoto: number;
  noOid: number;
  failures: Array<{ user: string; message: string }>;
  configError: null | { code: string; message: string; fix?: string };
}

/**
 * Sync Microsoft photos for the given users (default: every user with an
 * ms_oid: students, teachers, staff). One Graph pre-flight surfaces a credential
 * problem as a single configError instead of a wall of per-user failures.
 */
export async function syncMsPhotosBulk(userIds?: string[]): Promise<MsPhotoSyncSummary> {
  const summary: MsPhotoSyncSummary = {
    total: 0,
    synced: 0,
    unchanged: 0,
    noPhoto: 0,
    noOid: 0,
    failures: [],
    configError: null,
  };

  const conn = await checkGraphConnection();
  if (!conn.ok) {
    summary.configError = conn.error || { code: 'unknown', message: 'Microsoft Graph is unavailable.' };
    return summary;
  }

  const supabase = getSupabaseAdminClient();
  let query = supabase.from('users').select('id, name, ms_oid').not('ms_oid', 'is', null);
  if (userIds && userIds.length > 0) {
    query = supabase.from('users').select('id, name, ms_oid').in('id', userIds);
  }
  const { data: users } = await query;

  const list = users || [];
  summary.total = list.length;

  await mapWithConcurrency(list, 5, async (u: any) => {
    const res = await syncUserMsPhoto(supabase, u);
    switch (res.status) {
      case 'synced':
        summary.synced++;
        break;
      case 'unchanged':
        summary.unchanged++;
        break;
      case 'no_photo':
        summary.noPhoto++;
        break;
      case 'no_oid':
        summary.noOid++;
        break;
      case 'error':
        summary.failures.push({ user: u.email || u.name || u.id, message: res.message || 'unknown' });
        break;
    }
  });

  return summary;
}

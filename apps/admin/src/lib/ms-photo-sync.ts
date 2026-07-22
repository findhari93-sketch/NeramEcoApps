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
 *
 * Failure visibility: app-only `GET /users/{id}/photo/$value` returns 404 for a
 * sizeable share of users (e.g. no Exchange mailbox) even when the photo is
 * readable via a delegated token. `getUserPhotoResult` exposes the HTTP status
 * so we count genuine "no photo" (404) apart from permission (401/403) and
 * throttle (429) failures instead of miscounting them all as "no photo".
 */
import { createHash } from 'crypto';
import { getSupabaseAdminClient, createUserAvatar, getLatestMsAvatarHash } from '@neram/database';
import { getUserPhotoResult, checkGraphConnection } from '@neram/auth';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run an async fn over items with a bounded concurrency. `delayMs` adds a small
 * jittered pause after each item per worker to stay under Graph throttling.
 */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  delayMs = 0,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
      if (delayMs > 0 && i < items.length) {
        await sleep(delayMs + Math.floor(Math.random() * delayMs));
      }
    }
  });
  await Promise.all(workers);
}

export type MsPhotoSyncStatus =
  | 'synced'
  | 'unchanged'
  | 'no_photo'
  | 'no_oid'
  | 'permission_denied'
  | 'throttled'
  | 'graph_error'
  | 'error';

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
    // Bounded retry on throttle (429), honoring Retry-After.
    let result = await getUserPhotoResult(user.ms_oid);
    let attempts = 0;
    while (!result.ok && result.status === 429 && attempts < 2) {
      const wait = Math.min(result.retryAfterMs ?? 1000 * (attempts + 1), 10_000);
      await sleep(wait);
      result = await getUserPhotoResult(user.ms_oid);
      attempts++;
    }

    if (!result.ok) {
      if (result.status === 404) return { status: 'no_photo' };
      if (result.status === 401 || result.status === 403)
        return { status: 'permission_denied', message: `Graph ${result.status}` };
      if (result.status === 429) return { status: 'throttled', message: 'Graph 429' };
      // 0 = network/timeout, 5xx = transient server error
      return { status: 'graph_error', message: `Graph ${result.status || 'network error'}` };
    }

    const photo = result;
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
  /** 401/403 from Graph: app registration lacks photo-read consent for this user. */
  permissionDenied: number;
  /** 429 after retries: Graph throttled us. */
  throttled: number;
  /** 5xx / network / timeout reading the photo. */
  graphError: number;
  /** Our-side storage / DB write failures. */
  failures: Array<{ user: string; message: string }>;
  configError: null | { code: string; message: string; fix?: string };
}

const PAGE_SIZE = 500;

/** Fetch every user with an ms_oid, paginating past the ~1000-row PostgREST cap. */
async function fetchMsUsers(supabase: any): Promise<any[]> {
  const list: any[] = [];
  let from = 0;
  // Oldest-updated first: stable pagination + supports a rotating cron slice later.
  for (;;) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, ms_oid')
      .not('ms_oid', 'is', null)
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) break;
    const chunk = data || [];
    list.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return list;
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
    permissionDenied: 0,
    throttled: 0,
    graphError: 0,
    failures: [],
    configError: null,
  };

  const conn = await checkGraphConnection();
  if (!conn.ok) {
    summary.configError = conn.error || { code: 'unknown', message: 'Microsoft Graph is unavailable.' };
    return summary;
  }

  const supabase = getSupabaseAdminClient();
  let list: any[];
  if (userIds && userIds.length > 0) {
    const { data } = await supabase.from('users').select('id, name, email, ms_oid').in('id', userIds);
    list = data || [];
  } else {
    list = await fetchMsUsers(supabase);
  }

  summary.total = list.length;

  // Concurrency 5 with a ~300ms jittered spacing keeps us well under Graph throttling.
  await mapWithConcurrency(
    list,
    5,
    async (u: any) => {
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
        case 'permission_denied':
          summary.permissionDenied++;
          break;
        case 'throttled':
          summary.throttled++;
          break;
        case 'graph_error':
          summary.graphError++;
          break;
        case 'error':
          summary.failures.push({ user: u.email || u.name || u.id, message: res.message || 'unknown' });
          break;
      }
    },
    300,
  );

  return summary;
}

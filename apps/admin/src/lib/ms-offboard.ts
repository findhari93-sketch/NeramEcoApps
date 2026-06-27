// @ts-nocheck
/**
 * Shared Microsoft offboarding / reinstatement for alumni.
 *
 * Used by the graduate route, the restore route, and the standalone "Run
 * Microsoft offboarding" retry route. Each runs a one-time pre-flight
 * (checkGraphConnection) so a credential problem (e.g. expired secret) surfaces
 * as ONE clear configError instead of a wall of per-user failures, then processes
 * users with bounded concurrency. Never throws past the batch.
 */
import { getSupabaseAdminClient } from '@neram/database';
import {
  removeAllLicenses,
  addLicenses,
  setAccountEnabled,
  checkGraphConnection,
  classifyGraphError,
  getUserProfile,
  getUserPhoto,
} from '@neram/auth';

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

// Avatar URLs on these hosts die once the M365 account is offboarded, so they are
// safe to overwrite with our captured copy.
const MS_HOST_RE = /(graph\.microsoft\.com|login\.microsoftonline|sharepoint|office365|outlook)/i;

/**
 * Capture a student's Microsoft profile photo + details into our own storage/DB
 * BEFORE the license/sign-in is removed (after which they can become unreachable).
 * Photo -> public `documents` bucket; snapshot -> users.metadata. Avatar is set
 * only when missing or a dead Microsoft-hosted URL ("fill if missing"). Best-effort.
 */
export async function captureMicrosoftProfile(
  supabase: any,
  user: { id: string; ms_oid?: string | null },
): Promise<{ photoCaptured: boolean; detailsCaptured: boolean }> {
  let photoCaptured = false;
  let detailsCaptured = false;
  if (!user?.ms_oid) return { photoCaptured, detailsCaptured };

  try {
    const [profile, photo] = await Promise.all([getUserProfile(user.ms_oid), getUserPhoto(user.ms_oid)]);

    const { data: cur } = await supabase.from('users').select('metadata, avatar_url').eq('id', user.id).maybeSingle();
    const metadata = cur && cur.metadata && typeof cur.metadata === 'object' ? { ...cur.metadata } : {};
    const now = new Date().toISOString();

    let photoUrl: string | null = null;
    if (photo && photo.buffer) {
      const ext = (photo.contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
      const path = `alumni-avatars/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, photo.buffer, { contentType: photo.contentType, upsert: false });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        photoUrl = urlData?.publicUrl || null;
        photoCaptured = !!photoUrl;
      }
    }

    if (profile) {
      metadata.microsoft_profile_snapshot = profile;
      detailsCaptured = true;
    }
    metadata.microsoft_offboarded_at = now;
    if (photoUrl) metadata.microsoft_photo_url = photoUrl;

    const update: Record<string, unknown> = { metadata };
    const curAvatar = (cur?.avatar_url as string) || '';
    if (photoUrl && (!curAvatar || MS_HOST_RE.test(curAvatar))) {
      update.avatar_url = photoUrl;
    }
    await supabase.from('users').update(update).eq('id', user.id);
  } catch {
    // Best-effort: never block offboarding on capture.
  }

  return { photoCaptured, detailsCaptured };
}

/**
 * Remove the M365 license and disable sign-in for each user with a Microsoft
 * account. Stores removed license SKUs on users.alumni_removed_ms_licenses so a
 * later restore can re-add them. Reports group-assigned licenses and per-step
 * failures without aborting.
 */
export async function offboardMicrosoftAccounts(userIds: string[]) {
  const summary = {
    disabled: 0,
    licensesRemoved: 0,
    noMsAccount: 0,
    photosCaptured: 0,
    detailsCaptured: 0,
    groupAssigned: [] as string[],
    failures: [] as Array<{ user: string; step: string; code: string; message: string; fix?: string; raw?: string }>,
    configError: null as null | { code: string; message: string; fix?: string; raw?: string },
  };

  const conn = await checkGraphConnection();
  if (!conn.ok) {
    summary.configError = conn.error || { code: 'unknown', message: 'Microsoft Graph is unavailable.' };
    return summary;
  }

  const supabase = getSupabaseAdminClient();
  const { data: users } = await supabase.from('users').select('id, name, email, ms_oid').in('id', userIds);

  const label = (u: any) => u.email || u.name || u.id;
  const pushFailure = (u: any, step: string, reason?: string) => {
    const info = classifyGraphError(reason);
    summary.failures.push({ user: label(u), step, code: info.code, message: info.message, fix: info.fix, raw: info.raw });
  };

  await mapWithConcurrency(users || [], 6, async (u: any) => {
    if (!u.ms_oid) {
      summary.noMsAccount++;
      return;
    }

    // Capture photo + details FIRST, before the account is offboarded.
    const cap = await captureMicrosoftProfile(supabase, u);
    if (cap.photoCaptured) summary.photosCaptured++;
    if (cap.detailsCaptured) summary.detailsCaptured++;

    const lic = await removeAllLicenses(u.ms_oid);
    if (lic.success) {
      if (lic.removedSkuIds.length > 0) {
        summary.licensesRemoved++;
        await supabase.from('users').update({ alumni_removed_ms_licenses: lic.removedSkuIds }).eq('id', u.id);
      }
      if (lic.groupSkuIds.length > 0) summary.groupAssigned.push(label(u));
    } else {
      pushFailure(u, 'remove_license', lic.reason);
    }

    const dis = await setAccountEnabled(u.ms_oid, false);
    if (dis.success) summary.disabled++;
    else pushFailure(u, 'disable', dis.reason);
  });

  return summary;
}

/**
 * Re-enable Microsoft sign-in and re-add the licenses removed at graduation
 * (stored on users.alumni_removed_ms_licenses), then clear that column.
 */
export async function reinstateMicrosoftAccounts(userIds: string[]) {
  const summary = {
    enabled: 0,
    licensesReadded: 0,
    failures: [] as Array<{ user: string; step: string; code: string; message: string; fix?: string; raw?: string }>,
    configError: null as null | { code: string; message: string; fix?: string; raw?: string },
  };

  const conn = await checkGraphConnection();
  if (!conn.ok) {
    summary.configError = conn.error || { code: 'unknown', message: 'Microsoft Graph is unavailable.' };
    return summary;
  }

  const supabase = getSupabaseAdminClient();
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, ms_oid, alumni_removed_ms_licenses')
    .in('id', userIds);

  const label = (u: any) => u.email || u.name || u.id;
  const pushFailure = (u: any, step: string, reason?: string) => {
    const info = classifyGraphError(reason);
    summary.failures.push({ user: label(u), step, code: info.code, message: info.message, fix: info.fix, raw: info.raw });
  };

  await mapWithConcurrency(users || [], 6, async (u: any) => {
    if (!u.ms_oid) return;

    const en = await setAccountEnabled(u.ms_oid, true);
    if (en.success) summary.enabled++;
    else pushFailure(u, 'enable', en.reason);

    const skus = Array.isArray(u.alumni_removed_ms_licenses) ? u.alumni_removed_ms_licenses : [];
    if (skus.length > 0) {
      const add = await addLicenses(u.ms_oid, skus);
      if (add.success) {
        summary.licensesReadded++;
        await supabase.from('users').update({ alumni_removed_ms_licenses: null }).eq('id', u.id);
      } else {
        pushFailure(u, 'readd_license', add.reason);
      }
    } else {
      await supabase.from('users').update({ alumni_removed_ms_licenses: null }).eq('id', u.id);
    }
  });

  return summary;
}

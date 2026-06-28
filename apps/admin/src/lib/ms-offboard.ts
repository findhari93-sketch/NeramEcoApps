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
  userExists,
  findUserOidByEmail,
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
 * Record that a user's stored ms_oid points at a Microsoft account that no longer
 * exists (Graph 404). Keeps ms_oid for history but stamps metadata so the UI can
 * render "already removed" cleanly and ms-status can skip the dead Graph call.
 */
async function markMsAccountMissing(supabase: any, user: { id: string }): Promise<void> {
  try {
    const { data: cur } = await supabase.from('users').select('metadata').eq('id', user.id).maybeSingle();
    const metadata = cur && cur.metadata && typeof cur.metadata === 'object' ? { ...cur.metadata } : {};
    metadata.microsoft_account_missing = true;
    metadata.microsoft_offboarded_at = metadata.microsoft_offboarded_at || new Date().toISOString();
    await supabase.from('users').update({ metadata }).eq('id', user.id);
  } catch {
    // best-effort; never block the batch on a bookkeeping write.
  }
}

/**
 * Resolve the Microsoft account to act on for a user record. Microsoft is the
 * authority on email -> account, so a stored ms_oid that is null, stale (404), or
 * sitting on a duplicate record must not stop us: we verify the stored oid and, if
 * it does not resolve, fall back to the user's email/UPN. Returns the usable oid
 * and how it was found.
 */
async function resolveOid(u: any): Promise<{ oid: string | null; source: 'stored' | 'email' | 'none' }> {
  if (u.ms_oid && (await userExists(u.ms_oid))) {
    return { oid: u.ms_oid, source: 'stored' };
  }
  const byEmail = await findUserOidByEmail(u.email);
  if (byEmail) return { oid: byEmail, source: 'email' };
  return { oid: null, source: 'none' };
}

/**
 * Persist an email-resolved oid onto the record, but ONLY when no other record
 * already owns it. Many students have duplicate records (a Google signup + an MS
 * onboarding row) and the oid often lives on the other one, writing it here would
 * create two rows with the same ms_oid, so we skip the heal in that case and leave
 * the duplicate for manual cleanup.
 */
async function healOid(supabase: any, userId: string, oid: string): Promise<void> {
  try {
    const { data: others } = await supabase.from('users').select('id').eq('ms_oid', oid).neq('id', userId).limit(1);
    if (others && others.length) return; // another record owns it; do not create a conflict
    await supabase.from('users').update({ ms_oid: oid }).eq('id', userId);
  } catch {
    // best-effort
  }
}

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
    noMsAccountUsers: [] as string[],
    accountGone: 0,
    accountGoneUsers: [] as string[],
    resolvedByEmail: 0,
    resolvedByEmailUsers: [] as string[],
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
    // Find the real account by stored oid OR email/UPN, so a null/stale oid (or one
    // stuck on a duplicate record) does not let an active account slip through.
    const resolved = await resolveOid(u);
    if (!resolved.oid) {
      summary.noMsAccount++;
      summary.noMsAccountUsers.push(label(u));
      return;
    }
    const oid = resolved.oid;
    if (resolved.source === 'email') {
      summary.resolvedByEmail++;
      summary.resolvedByEmailUsers.push(label(u));
      await healOid(supabase, u.id, oid);
    }

    // Capture photo + details FIRST, before the account is offboarded.
    const cap = await captureMicrosoftProfile(supabase, { id: u.id, ms_oid: oid });
    if (cap.photoCaptured) summary.photosCaptured++;
    if (cap.detailsCaptured) summary.detailsCaptured++;

    const lic = await removeAllLicenses(oid);
    if (lic.success) {
      if (lic.removedSkuIds.length > 0) {
        summary.licensesRemoved++;
        await supabase.from('users').update({ alumni_removed_ms_licenses: lic.removedSkuIds }).eq('id', u.id);
      }
      if (lic.groupSkuIds.length > 0) summary.groupAssigned.push(label(u));
    } else if (classifyGraphError(lic.reason).code === 'account_not_found') {
      // Resolved oid points at a deleted Microsoft account: nothing to revoke.
      // Record it and skip the disable call (it would 404 the same way).
      summary.accountGone++;
      summary.accountGoneUsers.push(label(u));
      await markMsAccountMissing(supabase, u);
      return;
    } else {
      pushFailure(u, 'remove_license', lic.reason);
    }

    const dis = await setAccountEnabled(oid, false);
    if (dis.success) summary.disabled++;
    else if (classifyGraphError(dis.reason).code === 'account_not_found') {
      summary.accountGone++;
      summary.accountGoneUsers.push(label(u));
      await markMsAccountMissing(supabase, u);
    } else pushFailure(u, 'disable', dis.reason);
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
    accountGone: 0,
    accountGoneUsers: [] as string[],
    resolvedByEmail: 0,
    resolvedByEmailUsers: [] as string[],
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
    const resolved = await resolveOid(u);
    if (!resolved.oid) return;
    const oid = resolved.oid;
    if (resolved.source === 'email') {
      summary.resolvedByEmail++;
      summary.resolvedByEmailUsers.push(label(u));
      await healOid(supabase, u.id, oid);
    }

    const en = await setAccountEnabled(oid, true);
    if (en.success) summary.enabled++;
    else if (classifyGraphError(en.reason).code === 'account_not_found') {
      // Account is gone; nothing to reinstate. Clear the stored licenses so the
      // column does not keep pointing at SKUs that can never be re-added.
      summary.accountGone++;
      summary.accountGoneUsers.push(label(u));
      await markMsAccountMissing(supabase, u);
      await supabase.from('users').update({ alumni_removed_ms_licenses: null }).eq('id', u.id);
      return;
    } else pushFailure(u, 'enable', en.reason);

    const skus = Array.isArray(u.alumni_removed_ms_licenses) ? u.alumni_removed_ms_licenses : [];
    if (skus.length > 0) {
      const add = await addLicenses(oid, skus);
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

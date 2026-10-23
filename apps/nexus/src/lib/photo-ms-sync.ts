/**
 * Keeping one photo in two places.
 *
 * A student's picture must be the same image in Nexus and on their Microsoft
 * account (which is what Teams and Outlook show). They can set it in either
 * place, and a teacher approves it once.
 *
 *   Nexus upload  -> pending -> teacher approves -> PUSH to Microsoft
 *   Microsoft set -> PULL into Nexus as pending -> teacher approves
 *
 * The push happens on approval, never on upload. Pushing an unreviewed photo
 * would put an unvetted image on the student's tenant-wide identity, visible to
 * everyone in the organisation, which is exactly what the review exists to stop.
 *
 * Only a TEACHER's approval pushes: approve, Confirm on the Auto-approved tab,
 * or a staff upload on the student's behalf. An automatic approval by the face
 * check waits for that Confirm (founder's call 2026-09-10, kept 2026-10-23), so
 * a later rejection never has to chase a picture that is already on Teams.
 * Every teacher approval goes through {@link pushApprovedPhotosToMicrosoft}.
 *
 * Requires the ProfilePhoto.ReadWrite.All application permission with admin
 * consent. Even with it, app-only photo access needs the target account to have
 * an Exchange Online mailbox, so failure is expected for some users (a brand new
 * account has none for a while) and is always recorded rather than thrown.
 * {@link retryMicrosoftPhotoPushes} is the daily second attempt.
 */

import { createHash } from 'crypto';
import {
  getSupabaseAdminClient,
  getNexusSetting,
  createUserAvatar,
  getLatestMsAvatarHash,
  decideMicrosoftPull,
  shouldFetchMicrosoftPhoto,
  type PhotoSyncStatus,
} from '@neram/database';
import { getUserPhotoResult, setUserPhoto, classifyGraphError } from '@neram/auth';
import { resolvePhotoOrigin, isExternallyHosted } from './photo-origin';
import { toPhotoStatus } from './photo-gate';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from './feature-flags';

/** Mirroring an approved photo onto the student's real Microsoft identity. */
export const MS_PUSH_FEATURE = 'staff.photo-ms-push';

/** Mirrors the CHECK constraint on users.photo_ms_sync_status. */
export type MsPushStatus =
  | 'synced'
  | 'no_account'
  | 'no_photo'
  | 'no_mailbox'
  | 'denied'
  | 'throttled'
  | 'failed'
  | 'disabled';

export interface MsPushResult {
  userId: string;
  status: MsPushStatus;
  /** Short, teacher-readable explanation. Never raw Graph JSON. */
  message?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Graph rejects anything that is not a concrete image type. */
function normaliseImageType(contentType: string | null | undefined): string {
  const t = (contentType || '').toLowerCase().split(';')[0].trim();
  return t.startsWith('image/') ? t : 'image/jpeg';
}

function extensionFor(contentType: string): string {
  const ext = contentType.split('/')[1] || 'jpg';
  return ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
}

/**
 * Read the current photo bytes for a user, and make sure they live somewhere we
 * control.
 *
 * A Google sign-in avatar points straight at Google's CDN: we never stored a
 * copy, so the "approved photo" would keep depending on a URL we do not own and
 * could stop resolving at any time. Approving one is the right moment to take a
 * permanent copy, which is what this does.
 */
async function loadApprovedPhotoBytes(
  supabase: any,
  user: { id: string; avatar_url: string | null },
): Promise<{ buffer: Buffer; contentType: string; url: string } | null> {
  if (!user.avatar_url) return null;

  const res = await fetch(user.avatar_url, { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) return null;

  const contentType = normaliseImageType(res.headers.get('content-type'));
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0) return null;

  const { data: currentAvatar } = await supabase
    .from('user_avatars')
    .select('source')
    .eq('user_id', user.id)
    .eq('is_current', true)
    .maybeSingle();

  const origin = resolvePhotoOrigin({
    avatarSource: currentAvatar?.source ?? null,
    avatarUrl: user.avatar_url,
  });

  if (!isExternallyHosted(origin)) {
    return { buffer, contentType, url: user.avatar_url };
  }

  // Externally hosted: take our own copy and repoint the user at it.
  const path = `${user.id}/${Date.now()}-adopted.${extensionFor(contentType)}`;
  const { error: upErr } = await supabase.storage
    .from('profile-pictures')
    .upload(path, buffer, { contentType, upsert: false });
  if (upErr) {
    // Keep going with the original bytes. A failed copy must not block the push.
    return { buffer, contentType, url: user.avatar_url };
  }

  const { data: urlData } = supabase.storage.from('profile-pictures').getPublicUrl(path);
  const publicUrl = urlData?.publicUrl || user.avatar_url;

  const avatar = await createUserAvatar(
    user.id,
    {
      storage_path: publicUrl,
      file_name: `approved-photo.${extensionFor(contentType)}`,
      mime_type: contentType,
      file_size: buffer.byteLength,
      source: 'upload',
    },
    supabase,
  ).catch(() => null);

  await supabase
    .from('users')
    .update({
      avatar_url: publicUrl,
      ...(avatar ? { photo_avatar_id: avatar.id } : {}),
    })
    .eq('id', user.id);

  return { buffer, contentType, url: publicUrl };
}

/**
 * Fingerprint what Microsoft actually stored, so the next pull recognises this
 * photo as ours and does not send it back for review.
 *
 * This has to be a read-back. Graph re-encodes the image it receives, so the
 * hash of what we uploaded will not match the hash of what it later serves, and
 * a dedupe built on the upload bytes would re-queue the same face forever.
 *
 * Written as a non-current user_avatars row: its only job is to carry the hash
 * that getLatestMsAvatarHash reads. It must not become the displayed avatar,
 * which is why createUserAvatar (which flips is_current) is not used here.
 */
async function fingerprintPushedPhoto(
  supabase: any,
  userId: string,
  msOid: string,
  storagePath: string,
): Promise<{ ok: boolean; message?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const readBack = await getUserPhotoResult(msOid);
    if (readBack.ok) {
      const hash = createHash('sha256').update(readBack.buffer).digest('hex');
      await supabase.from('user_avatars').insert({
        user_id: userId,
        storage_path: storagePath,
        file_name: 'microsoft-mirror.jpg',
        mime_type: readBack.contentType,
        source: 'microsoft',
        content_hash: hash,
        is_current: false,
      });
      return { ok: true };
    }
    // Graph can lag briefly between accepting a photo and serving it.
    if (attempt < 2) await sleep(700 * (attempt + 1));
  }
  return {
    ok: false,
    message:
      'The photo was sent to Microsoft but could not be read back to fingerprint it. It may be offered for review once more.',
  };
}

/**
 * Push a student's approved photo onto their Microsoft account.
 * Never throws: every outcome is a recorded status.
 */
export async function pushApprovedPhotoToMicrosoft(userId: string): Promise<MsPushResult> {
  const supabase = getSupabaseAdminClient() as any;

  const record = async (status: MsPushStatus, message?: string): Promise<MsPushResult> => {
    await supabase
      .from('users')
      .update({
        photo_ms_sync_status: status,
        photo_ms_sync_error: message ?? null,
        photo_ms_synced_at: status === 'synced' ? new Date().toISOString() : null,
      })
      .eq('id', userId)
      .then(
        () => undefined,
        () => undefined,
      );
    return { userId, status, message };
  };

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, ms_oid, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return { userId, status: 'failed', message: 'Student not found.' };
    if (!user.ms_oid) {
      return record('no_account', 'This student has no Microsoft account on file.');
    }

    const photo = await loadApprovedPhotoBytes(supabase, user);
    if (!photo) {
      return record('no_photo', 'The approved photo could not be read back from storage.');
    }

    let result = await setUserPhoto(user.ms_oid, photo.buffer, photo.contentType);
    // One bounded retry on throttling, honouring Retry-After.
    if (!result.ok && result.status === 429) {
      await sleep(Math.min(result.retryAfterMs ?? 2000, 10_000));
      result = await setUserPhoto(user.ms_oid, photo.buffer, photo.contentType);
    }

    if (!result.ok) {
      if (result.status === 404) {
        return record(
          'no_mailbox',
          'Microsoft will not hold a photo for this account. It usually needs a mailbox licence.',
        );
      }
      if (result.status === 401 || result.status === 403) {
        const info = classifyGraphError(result.error, 'photo');
        return record('denied', info.fix || info.message);
      }
      if (result.status === 429) {
        return record('throttled', 'Microsoft is rate limiting us. Try again shortly.');
      }
      return record('failed', `Microsoft rejected the photo (${result.status || 'network error'}).`);
    }

    const fingerprint = await fingerprintPushedPhoto(
      supabase,
      userId,
      user.ms_oid,
      photo.url,
    );

    return record('synced', fingerprint.ok ? undefined : fingerprint.message);
  } catch (err: any) {
    return record('failed', err?.message || 'The photo could not be sent to Microsoft.');
  }
}

/** Whether staff.photo-ms-push is on. A settings read that fails reads as the default. */
export async function isMicrosoftPhotoPushEnabled(): Promise<boolean> {
  const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
  const flags: FlagMap = resolveFlags(((setting as any)?.value as FlagMap) || {});
  return flags[MS_PUSH_FEATURE] === true;
}

/**
 * The one door every teacher approval goes through on its way to Microsoft: an
 * approve or Confirm (api/photo-review) and a staff upload
 * (api/photo-review/upload). Never called for an automatic approval.
 *
 * Honours the staff.photo-ms-push switch. Never throws and never rejects: every
 * student gets a result, and each push records its own outcome on the users
 * row (photo_ms_sync_status), which is what the daily retry reads.
 */
export async function pushApprovedPhotosToMicrosoft(userIds: string[]): Promise<MsPushResult[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return [];

  let enabled = false;
  try {
    enabled = await isMicrosoftPhotoPushEnabled();
  } catch {
    enabled = false;
  }
  if (!enabled) {
    return ids.map((userId) => ({
      userId,
      status: 'disabled' as const,
      message: 'Copying photos to Microsoft is switched off.',
    }));
  }

  return Promise.all(
    ids.map((userId) =>
      pushApprovedPhotoToMicrosoft(userId).catch((e) => ({
        userId,
        status: 'failed' as const,
        message: e instanceof Error ? e.message : 'Could not reach Microsoft.',
      })),
    ),
  );
}

/**
 * Outcomes worth another try. A brand new account usually has no mailbox for a
 * while (no_mailbox), Graph throttles and blips (throttled, failed), storage
 * can be briefly unreadable (no_photo), and consent can be fixed after the fact
 * (denied). Only 'synced' and 'no_account' are final.
 */
export const RETRYABLE_PUSH_STATUSES: MsPushStatus[] = [
  'failed',
  'throttled',
  'no_mailbox',
  'no_photo',
  'denied',
  'disabled',
];

/** Students per retry run. Small on purpose: the cron that carries this has other work. */
export const PUSH_RETRY_LIMIT = 20;
const PUSH_RETRY_CONCURRENCY = 3;
/** Stop starting new pushes past this, so the host cron stays inside its maxDuration. */
const PUSH_RETRY_BUDGET_MS = 35_000;

export interface PushRetrySummary {
  enabled: boolean;
  considered: number;
  synced: number;
  stillFailing: number;
  byStatus: Partial<Record<MsPushStatus, number>>;
  error?: string;
}

export interface PushRetryOptions {
  /** Injected in tests. Defaults to the service-role client. */
  supabase?: any;
  /** Injected in tests. Defaults to pushApprovedPhotoToMicrosoft. */
  push?: (userId: string) => Promise<MsPushResult>;
  /** Injected in tests. Defaults to reading the feature flag. */
  enabled?: () => Promise<boolean>;
  limit?: number;
  budgetMs?: number;
}

/**
 * Second attempt for teacher-approved photos that did not reach Microsoft.
 *
 * Picks approved students with a Microsoft account whose last push ended in a
 * retryable status. A push only ever starts from a teacher's approval, so this
 * never copies a photo the face check approved on its own (photo_review_method
 * 'auto' is also excluded outright, in case a status was left behind).
 *
 * A photo with status NULL is deliberately left alone: never pushed means
 * either an automatic approval still waiting for Confirm, or a photo approved
 * while the push was switched off, and copying those is a separate decision.
 *
 * Newest approvals first, so a fresh account whose mailbox has just appeared is
 * retried ahead of an old account that will never have one. Never throws.
 */
export async function retryMicrosoftPhotoPushes(
  opts: PushRetryOptions = {},
): Promise<PushRetrySummary> {
  const summary: PushRetrySummary = {
    enabled: false,
    considered: 0,
    synced: 0,
    stillFailing: 0,
    byStatus: {},
  };

  try {
    const enabled = await (opts.enabled ?? isMicrosoftPhotoPushEnabled)().catch(() => false);
    summary.enabled = enabled;
    if (!enabled) return summary;

    const supabase = opts.supabase ?? (getSupabaseAdminClient() as any);
    const push = opts.push ?? pushApprovedPhotoToMicrosoft;
    const limit = opts.limit ?? PUSH_RETRY_LIMIT;
    const deadline = Date.now() + (opts.budgetMs ?? PUSH_RETRY_BUDGET_MS);

    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('photo_status', 'approved')
      .not('ms_oid', 'is', null)
      .in('photo_ms_sync_status', RETRYABLE_PUSH_STATUSES)
      .or('photo_review_method.is.null,photo_review_method.neq.auto')
      .order('photo_reviewed_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      summary.error = error.message || 'Could not list photos to retry.';
      return summary;
    }

    const ids: string[] = ((data || []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
    summary.considered = ids.length;

    let cursor = 0;
    const workers = Array.from({ length: Math.min(PUSH_RETRY_CONCURRENCY, ids.length) }, async () => {
      while (cursor < ids.length && Date.now() < deadline) {
        const userId = ids[cursor++];
        const result = await push(userId).catch(
          (e): MsPushResult => ({
            userId,
            status: 'failed',
            message: e instanceof Error ? e.message : 'Could not reach Microsoft.',
          }),
        );
        summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
        if (result.status === 'synced') summary.synced += 1;
        else summary.stillFailing += 1;
      }
    });
    await Promise.all(workers);
    return summary;
  } catch (err) {
    summary.error = err instanceof Error ? err.message : 'The Microsoft photo retry failed.';
    return summary;
  }
}

export type MsPullStatus =
  | 'pulled'
  | 'unchanged'
  | 'in_review'
  | 'no_photo'
  | 'no_account'
  | 'denied'
  | 'throttled'
  | 'failed';

export interface MsPullResult {
  userId: string;
  status: MsPullStatus;
  message?: string;
}

/**
 * Take a user's Microsoft photo into Nexus and send it for review.
 *
 * The decision of whether to take it at all is
 * {@link decideMicrosoftPull}, shared with the Admin weekly cron so the two
 * cannot drift. Anything pulled lands on 'pending', including over a photo that
 * was already approved: a student who passes review and then swaps their
 * picture in Microsoft has to be looked at again.
 */
export async function pullMicrosoftPhoto(userId: string): Promise<MsPullResult> {
  const supabase = getSupabaseAdminClient() as any;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, ms_oid, photo_status')
      .eq('id', userId)
      .maybeSingle();

    if (!user) return { userId, status: 'failed', message: 'Student not found.' };
    if (!user.ms_oid) return { userId, status: 'no_account' };

    const photoStatus = toPhotoStatus(user.photo_status) as PhotoSyncStatus;
    if (!shouldFetchMicrosoftPhoto(photoStatus)) {
      return { userId, status: 'in_review' };
    }

    const result = await getUserPhotoResult(user.ms_oid);
    if (!result.ok) {
      if (result.status === 404) return { userId, status: 'no_photo' };
      if (result.status === 401 || result.status === 403) {
        const info = classifyGraphError(`Graph ${result.status}`, 'photo');
        return { userId, status: 'denied', message: info.fix || info.message };
      }
      if (result.status === 429) return { userId, status: 'throttled' };
      return { userId, status: 'failed', message: `Graph ${result.status || 'network error'}` };
    }

    const hash = createHash('sha256').update(result.buffer).digest('hex');
    const previousHash = await getLatestMsAvatarHash(userId, supabase);
    const decision = decideMicrosoftPull({
      photoStatus,
      hashChanged: !previousHash || previousHash !== hash,
    });
    if (!decision.pull) {
      return { userId, status: decision.reason === 'in_review' ? 'in_review' : 'unchanged' };
    }

    const ext = extensionFor(result.contentType);
    const path = `${userId}/${Date.now()}-microsoft.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('profile-pictures')
      .upload(path, result.buffer, { contentType: result.contentType, upsert: false });
    if (upErr) {
      return { userId, status: 'failed', message: upErr.message || 'Could not store the photo.' };
    }

    const { data: urlData } = supabase.storage.from('profile-pictures').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return { userId, status: 'failed', message: 'Could not build a URL for the photo.' };
    }

    const avatar = await createUserAvatar(
      userId,
      {
        storage_path: publicUrl,
        file_name: `microsoft-photo.${ext}`,
        mime_type: result.contentType,
        file_size: result.buffer.byteLength,
        source: 'microsoft',
        content_hash: hash,
      },
      supabase,
    );

    // Back into the queue. Any earlier rejection is cleared, because this is a
    // different photo and it deserves a fresh look.
    await supabase
      .from('users')
      .update({
        avatar_url: publicUrl,
        photo_status: 'pending',
        photo_submitted_at: new Date().toISOString(),
        photo_avatar_id: avatar.id,
        photo_reviewed_by: null,
        photo_reviewed_at: null,
        photo_rejection_reason: null,
        // Hygiene only. The face check keys its verdict on the photo URL, so
        // a new photo reads as unchecked either way; the review page's
        // auto-check picks it up.
        photo_review_method: null,
        photo_ai_check: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    return { userId, status: 'pulled' };
  } catch (err: any) {
    return { userId, status: 'failed', message: err?.message || 'Could not read the Microsoft photo.' };
  }
}

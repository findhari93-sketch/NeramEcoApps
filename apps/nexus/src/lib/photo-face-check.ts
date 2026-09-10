/**
 * The server half of automatic photo approval.
 *
 * Looks at one student's pending photo, records what the face check saw, and
 * approves the photo when the rules in photo-auto-review.ts allow it.
 *
 * Two callers, one write path:
 *   - POST /api/profile/avatar, right after a student uploads, so a clear photo
 *     is approved before they have closed the dialog.
 *   - POST /api/photo-review/auto-check, from the teacher's review page, which
 *     also sweeps up photos pulled in from Microsoft by either sync.
 *
 * Never throws. Every outcome is a status, because this sits on top of a queue
 * that already works: a failure must leave the photo exactly where it was,
 * waiting for a teacher.
 *
 * What it deliberately does NOT do:
 *   - reject. Only a teacher rejects, see photo-auto-review.ts.
 *   - copy the photo to Microsoft. That waits for a teacher's Confirm, so a
 *     later rejection never has to chase a picture that is already on Teams.
 *   - identify anyone. The prompt asks whether this is a usable profile photo
 *     of one real person, never who that person is.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { AiBlockedError, generateGemini } from '@neram/ai';
import { describeError, messageOf } from './api-errors';
import { isPhotoReviewable } from './photo-roster';
import {
  FACE_ISSUES,
  buildFailedCheck,
  buildStoredCheck,
  isCheckableImageType,
  needsFaceCheck,
  parseVerdict,
  shouldAutoApprove,
  sniffImageType,
  type StoredFaceCheck,
} from './photo-auto-review';

export type FaceCheckStatus =
  /** A clear face. The photo is now approved, method 'auto'. */
  | 'approved'
  /** Looked at, not clear enough. Still pending, with the reason recorded. */
  | 'kept_pending'
  /** Nothing to do: not reviewable, already checked, or someone decided first. */
  | 'skipped'
  /** The AI controls refused the call (switched off, or over budget). Nothing written. */
  | 'blocked'
  /** The check could not run. Still pending. */
  | 'failed';

export interface FaceCheckOutcome {
  userId: string;
  status: FaceCheckStatus;
  /**
   * True when this photo will not be picked again straight away: a verdict or
   * a failure was written, or there was nothing left to do. The review page
   * stops its check loop on a round where nothing was recorded, which is what
   * keeps a database that refuses every write from looping.
   */
  recorded: boolean;
  message?: string;
}

export interface FaceCheckOptions {
  /** users.id to attribute the AI spend to. */
  actorId?: string | null;
  /** Injected in tests. Defaults to the service-role client. */
  supabase?: any;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests. */
  now?: () => Date;
}

/** Same ceiling as the upload routes. A photo larger than this never got stored. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Downloading our own public storage object. Anything slower is not worth waiting on. */
const FETCH_TIMEOUT_MS = 8_000;

/** Structured output, so the answer is JSON in exactly the shape parseVerdict reads. */
export const FACE_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    faces: { type: 'integer' },
    real_photo: { type: 'boolean' },
    face_clear: { type: 'boolean' },
    appropriate: { type: 'boolean' },
    confidence: { type: 'number' },
    issues: { type: 'array', items: { type: 'string', enum: [...FACE_ISSUES] } },
  },
  required: ['faces', 'real_photo', 'face_clear', 'appropriate', 'confidence', 'issues'],
};

export const FACE_CHECK_INSTRUCTION = `You check profile photos for student accounts at a school. A usable profile photo shows exactly one real person's face, clearly, like an ID card photo or a clear selfie.

Look at the image and report:
- faces: how many human faces are visible. 0 if there are none.
- real_photo: true only for a real photograph of a person. False for a drawing, cartoon, avatar, emoji, logo, a screenshot, or a photo of a screen or a printed picture.
- face_clear: true only when the face is in focus, well lit, large enough in the frame to recognise the person, and the eyes, nose and mouth are all visible. False when sunglasses, a mask, a hand, hair or a heavy filter covers them.
- appropriate: false for anything a school should not display, such as nudity, violence, or offensive gestures or text.
- confidence: from 0 to 1, how sure you are that this is a usable profile photo of one real person.
- issues: every problem that applies, using only these values: no_face, several_faces, face_covered, blurry_or_dark, face_too_small, not_a_real_photo, inappropriate. Use an empty list when there are none.

Do not try to identify who the person is. Judge only whether the photo is usable.`;

type PhotoRead =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; reason: string };

async function readPhoto(doFetch: typeof fetch, url: string): Promise<PhotoRead> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `The photo could not be downloaded (${res.status}).` };

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) return { ok: false, reason: 'The photo file is empty.' };
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      return { ok: false, reason: 'The photo is too large to check.' };
    }

    // Trust the header when it names a readable image, otherwise look at the
    // bytes: storage answers application/octet-stream for an object uploaded
    // without a type, and that must not skip a perfectly good JPEG.
    const header = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const type = isCheckableImageType(header) ? header : sniffImageType(bytes);
    if (!type || !isCheckableImageType(type)) {
      return { ok: false, reason: `The face check cannot read ${type || header || 'this file type'}.` };
    }

    return {
      ok: true,
      base64: Buffer.from(bytes).toString('base64'),
      mimeType: type === 'image/jpg' ? 'image/jpeg' : type,
    };
  } catch {
    return {
      ok: false,
      reason: controller.signal.aborted
        ? 'The photo took too long to download.'
        : 'The photo could not be downloaded.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record a check without changing the decision. Guarded on the photo it was
 * about: if the student replaced it meanwhile, this verdict describes a photo
 * nobody is looking at, and the zero-row result is correct.
 */
async function recordCheck(
  supabase: any,
  user: { id: string; avatar_url: string },
  check: StoredFaceCheck,
  status: FaceCheckStatus,
  message?: string,
): Promise<FaceCheckOutcome> {
  const { error } = await supabase
    .from('users')
    .update({ photo_ai_check: check })
    .eq('id', user.id)
    .eq('avatar_url', user.avatar_url)
    .select('id');

  if (error) {
    console.error('photo-face-check: could not record the check for', user.id, describeError(error));
    return { userId: user.id, status: 'failed', recorded: false, message: describeError(error) };
  }
  return { userId: user.id, status, recorded: true, message };
}

/** Check one student's current photo. See the file header for what it will and will not do. */
export async function runFaceCheck(
  userId: string,
  opts: FaceCheckOptions = {},
): Promise<FaceCheckOutcome> {
  const now = opts.now ?? (() => new Date());

  try {
    const supabase = opts.supabase ?? (getSupabaseAdminClient() as any);
    const doFetch = opts.fetchImpl ?? fetch;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, ms_oid, is_alumni, avatar_url, photo_status, photo_ai_check, photo_avatar_id')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      return { userId, status: 'failed', recorded: false, message: describeError(userError) };
    }
    if (!user || !isPhotoReviewable(user) || !needsFaceCheck(user, now())) {
      return { userId, status: 'skipped', recorded: true };
    }

    const photo = await readPhoto(doFetch, user.avatar_url);
    if (!photo.ok) {
      return recordCheck(
        supabase,
        user,
        buildFailedCheck(user.avatar_url, photo.reason, now()),
        'failed',
        photo.reason,
      );
    }

    let answer: { text: string; model: string };
    try {
      answer = await generateGemini({
        feature: 'nexus.photo-face-check',
        systemInstruction: FACE_CHECK_INSTRUCTION,
        parts: [
          { inline_data: { mime_type: photo.mimeType, data: photo.base64 } },
          { text: 'Check this profile photo.' },
        ],
        responseMimeType: 'application/json',
        responseSchema: FACE_CHECK_SCHEMA,
        temperature: 0,
        // The 2.5 models count their thinking against this ceiling, so a tight
        // one returns a truncated answer that still costs full price.
        maxOutputTokens: 2048,
        actorId: opts.actorId ?? null,
      });
    } catch (err) {
      if (err instanceof AiBlockedError) {
        // Switched off or over budget. Write nothing, so every one of these
        // photos is checked as soon as it is switched back on.
        return { userId, status: 'blocked', recorded: false, message: err.message };
      }
      const reason = messageOf(err, 'The face check could not run.');
      return recordCheck(supabase, user, buildFailedCheck(user.avatar_url, reason, now()), 'failed', reason);
    }

    const verdict = parseVerdict(answer.text);
    if (!verdict) {
      const reason = 'The face check answered in a shape that could not be read.';
      return recordCheck(supabase, user, buildFailedCheck(user.avatar_url, reason, now()), 'failed', reason);
    }

    const check = buildStoredCheck(verdict, user.avatar_url, answer.model, now());
    if (!shouldAutoApprove(verdict)) {
      return recordCheck(supabase, user, check, 'kept_pending');
    }

    // The avatar row the decision is about, same as a teacher decision records.
    const { data: avatar } = await supabase
      .from('user_avatars')
      .select('id, storage_path')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .maybeSingle();

    const decidedAt = now().toISOString();

    // Guarded three ways, so a person always beats the machine: still pending
    // (a teacher did not decide while Gemini was thinking), still this photo
    // (the student did not replace it), and .select('id') so a zero-row update
    // is seen for what it is rather than reported as an approval.
    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        photo_status: 'approved',
        photo_review_method: 'auto',
        photo_reviewed_by: null,
        photo_reviewed_at: decidedAt,
        photo_rejection_reason: null,
        photo_avatar_id: avatar?.id ?? user.photo_avatar_id ?? null,
        photo_ai_check: check,
        updated_at: decidedAt,
      })
      .eq('id', user.id)
      .eq('photo_status', 'pending')
      .eq('avatar_url', user.avatar_url)
      .select('id');

    if (updateError) {
      console.error('photo-face-check: approval did not persist for', user.id, describeError(updateError));
      return { userId, status: 'failed', recorded: false, message: describeError(updateError) };
    }
    if ((updated?.length ?? 0) !== 1) {
      // Someone got there first. Their decision stands and nothing is logged
      // against a photo that is no longer the one in question.
      return { userId, status: 'skipped', recorded: true };
    }

    // Not fatal, same as the teacher path: the approval is real, and the audit
    // trail is the casualty.
    const { error: auditError } = await supabase.from('nexus_photo_reviews').insert({
      user_id: user.id,
      avatar_id: avatar?.id ?? null,
      avatar_url: avatar?.storage_path ?? user.avatar_url,
      decision: 'approved',
      method: 'auto',
      reviewed_by: null,
      ai_check: check,
    });
    if (auditError) {
      console.error('photo-face-check: audit row failed for', user.id, describeError(auditError));
    }

    return { userId, status: 'approved', recorded: true };
  } catch (err) {
    return { userId, status: 'failed', recorded: false, message: messageOf(err, 'The face check failed.') };
  }
}

/**
 * runFaceCheck with a ceiling, for a caller that is holding a person's request
 * open. Past the ceiling the caller gets 'failed' and moves on; the check may
 * still land, and every write it makes is guarded, so a late one is harmless.
 */
export async function runFaceCheckWithin(
  userId: string,
  ms: number,
  opts: FaceCheckOptions = {},
): Promise<FaceCheckOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FaceCheckOutcome>((resolveTimeout) => {
    timer = setTimeout(
      () =>
        resolveTimeout({
          userId,
          status: 'failed',
          recorded: false,
          message: 'The face check took too long. A teacher will look at this photo.',
        }),
      ms,
    );
  });
  try {
    return await Promise.race([runFaceCheck(userId, opts), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

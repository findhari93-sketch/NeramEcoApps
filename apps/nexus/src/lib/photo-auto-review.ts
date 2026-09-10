/**
 * Automatic approval of student profile photos: every rule, in one pure module.
 *
 * A teacher used to open every photo, and nearly every decision was the same
 * one: yes, that is one person's face and it is clear. The server now asks
 * Gemini that question when a photo arrives (lib/photo-face-check.ts), and this
 * module decides what the answer is allowed to do.
 *
 * It is only ever allowed to say yes. A rejection blocks the student from Nexus
 * and messages them, so a "no" and a "not sure" both leave the photo in Needs
 * review for a human, with the reason shown on the card. There is no
 * auto-reject path anywhere, on purpose.
 *
 * An automatic yes is a real approval for the photo gate, but the photo is NOT
 * copied onto the student's Microsoft account until a teacher confirms it from
 * the Auto-approved tab. That was the user's call (2026-09-10): a teacher who
 * later rejects an auto-approved photo must never have to chase it off Teams.
 *
 * PURE: no Supabase, no fetch and no @neram/ai, so the client page can import
 * it and every rule here is unit-testable. Same discipline as photo-gate.ts.
 */

import { toPhotoStatus } from './photo-gate';

/** Everything the check may flag. Any one of them keeps the photo for a teacher. */
export const FACE_ISSUES = [
  'no_face',
  'several_faces',
  'face_covered',
  'blurry_or_dark',
  'face_too_small',
  'not_a_real_photo',
  'inappropriate',
] as const;

export type FaceIssue = (typeof FACE_ISSUES)[number];

/** Who approved a photo. NULL in the database reads as 'teacher'. */
export type PhotoReviewMethod = 'teacher' | 'auto';

/** The five buckets on the review page. Every student sits in exactly one. */
export type ReviewTab = 'pending' | 'auto' | 'missing' | 'rejected' | 'approved';

/**
 * Lowest model confidence that may approve without a teacher.
 *
 * Deliberately high. A wrong yes is only caught if a teacher opens the
 * Auto-approved tab, which is optional, so the check should rarely need
 * catching. A photo just under the line costs nothing: it waits for a teacher,
 * exactly as every photo did before this existed.
 */
export const AUTO_APPROVE_MIN_CONFIDENCE = 0.85;

/**
 * How long a check that FAILED (Gemini error, unreadable file) waits before it
 * is tried again. Without the wait, a photo that always fails would be sent
 * again on every page load, and the page's check loop would never finish.
 */
export const FAILED_CHECK_RETRY_MS = 6 * 60 * 60 * 1000;

/** What the model reports about one photo. Snake case, same as the schema it answers. */
export interface FaceVerdict {
  faces: number;
  real_photo: boolean;
  face_clear: boolean;
  appropriate: boolean;
  confidence: number;
  issues: FaceIssue[];
}

/**
 * users.photo_ai_check. Carries the URL of the photo it judged, so a replaced
 * photo reads as unchecked without any writer having to remember to clear it.
 * Exactly one of `verdict` and `error` is set.
 */
export interface StoredFaceCheck {
  avatar_url: string;
  checked_at: string;
  model: string | null;
  verdict: FaceVerdict | null;
  error: string | null;
}

/** Image types Gemini can read. GIF is not one of them, so a GIF waits for a teacher. */
const CHECKABLE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function isCheckableImageType(mime: string | null | undefined): boolean {
  const type = (mime || '').toLowerCase().split(';')[0].trim();
  return CHECKABLE_TYPES.includes(type);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...Array.from(bytes.subarray(start, start + length)));
}

/**
 * The image type from a file's first bytes.
 *
 * Storage does not always send a useful content-type: an object uploaded
 * without one comes back as application/octet-stream, and a real JPEG must not
 * be skipped for that. Returns null for anything it does not recognise.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Read a model answer (raw JSON text or an already-parsed object) defensively.
 *
 * Every missing boolean reads as false and a missing confidence as 0, so a half
 * answer can never approve anything. Unknown issues are dropped rather than
 * failing the whole verdict. Returns null when there is nothing usable at all.
 */
export function parseVerdict(raw: unknown): FaceVerdict | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const v = value as Record<string, unknown>;
  if (typeof v.faces !== 'number' || !Number.isFinite(v.faces)) return null;

  const known = FACE_ISSUES as readonly string[];
  const issues = Array.isArray(v.issues)
    ? Array.from(
        new Set(v.issues.filter((i): i is FaceIssue => typeof i === 'string' && known.includes(i))),
      )
    : [];

  return {
    faces: Math.max(0, Math.floor(v.faces)),
    real_photo: v.real_photo === true,
    face_clear: v.face_clear === true,
    appropriate: v.appropriate === true,
    confidence: clamp01(v.confidence),
    issues,
  };
}

/** The whole approval rule. Every condition must hold; there is no partial credit. */
export function shouldAutoApprove(verdict: FaceVerdict | null | undefined): boolean {
  if (!verdict) return false;
  return (
    verdict.faces === 1 &&
    verdict.real_photo &&
    verdict.face_clear &&
    verdict.appropriate &&
    verdict.issues.length === 0 &&
    verdict.confidence >= AUTO_APPROVE_MIN_CONFIDENCE
  );
}

export function buildStoredCheck(
  verdict: FaceVerdict,
  avatarUrl: string,
  model: string | null,
  now: Date,
): StoredFaceCheck {
  return { avatar_url: avatarUrl, checked_at: now.toISOString(), model, verdict, error: null };
}

/** Recorded when a check could not produce a verdict, so it is not retried at once. */
export function buildFailedCheck(avatarUrl: string, error: string, now: Date): StoredFaceCheck {
  return { avatar_url: avatarUrl, checked_at: now.toISOString(), model: null, verdict: null, error };
}

/** Read users.photo_ai_check back. A record with neither a verdict nor an error says nothing. */
export function readStoredCheck(value: unknown): StoredFaceCheck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.avatar_url !== 'string' || !v.avatar_url.trim()) return null;

  const verdict = v.verdict == null ? null : parseVerdict(v.verdict);
  const error = typeof v.error === 'string' && v.error ? v.error : null;
  if (!verdict && !error) return null;

  return {
    avatar_url: v.avatar_url,
    checked_at: typeof v.checked_at === 'string' ? v.checked_at : '',
    model: typeof v.model === 'string' ? v.model : null,
    verdict,
    error: verdict ? null : error,
  };
}

export interface FaceCheckCandidate {
  photo_status?: string | null;
  avatar_url?: string | null;
  photo_ai_check?: unknown;
}

/**
 * Should this photo be sent to the face check?
 *
 * Only a pending photo, only one that exists, and only when there is no verdict
 * for THIS photo yet. A failed check is retried once FAILED_CHECK_RETRY_MS has
 * passed. Approved, rejected and missing photos are never checked: those are
 * already decided, and a machine second-guessing a teacher is not the job.
 */
export function needsFaceCheck(
  user: FaceCheckCandidate | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!user) return false;
  if (toPhotoStatus(user.photo_status) !== 'pending') return false;

  const url = (user.avatar_url || '').trim();
  if (!url) return false;

  const stored = readStoredCheck(user.photo_ai_check);
  if (!stored || stored.avatar_url.trim() !== url) return true;
  if (stored.verdict) return false;

  const at = Date.parse(stored.checked_at);
  return !Number.isFinite(at) || now.getTime() - at >= FAILED_CHECK_RETRY_MS;
}

/** Which tab a student belongs on. Auto-approved is split out of Approved. */
export function reviewTabFor(user: {
  photo_status?: string | null;
  photo_review_method?: string | null;
}): ReviewTab {
  const status = toPhotoStatus(user.photo_status);
  if (status === 'approved' && user.photo_review_method === 'auto') return 'auto';
  return status;
}

/** Parse the ?status= param. Unknown values fall back the same way toPhotoStatus does. */
export function toReviewTab(value: unknown): ReviewTab {
  return value === 'auto' ? 'auto' : toPhotoStatus(value);
}

const ISSUE_LABELS: Record<FaceIssue, string> = {
  no_face: 'No face found',
  several_faces: 'More than one person',
  face_covered: 'Face covered',
  blurry_or_dark: 'Blurry or too dark',
  face_too_small: 'Face too small',
  not_a_real_photo: 'Not a real photo',
  inappropriate: 'Not suitable',
};

export function faceIssueLabel(issue: FaceIssue): string {
  return ISSUE_LABELS[issue];
}

/**
 * The one line shown on a Needs review card when the check looked at this
 * photo and would not approve it, so the teacher knows why it is still there.
 * Null when there is nothing useful to say: no check yet, a check about an
 * older photo, a failed check, or a verdict that would have approved.
 */
export function aiHintFor(check: unknown, avatarUrl: string | null | undefined): string | null {
  const stored = readStoredCheck(check);
  const url = (avatarUrl || '').trim();
  if (!stored || !url || stored.avatar_url.trim() !== url || !stored.verdict) return null;
  if (shouldAutoApprove(stored.verdict)) return null;

  const first = stored.verdict.issues[0];
  return first ? `AI flagged: ${faceIssueLabel(first)}` : 'AI was not sure';
}

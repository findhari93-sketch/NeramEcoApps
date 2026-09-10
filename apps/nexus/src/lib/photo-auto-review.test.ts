/**
 * The rules for what an automatic face check is allowed to do.
 *
 * The one property that matters most is asymmetric: this may approve a photo,
 * and it must never be able to do anything else. Every "no" and every "not
 * sure" has to leave the photo with a teacher, so most of these tests are about
 * the ways a verdict can fall short of a yes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AUTO_APPROVE_MIN_CONFIDENCE,
  FACE_ISSUES,
  FAILED_CHECK_RETRY_MS,
  aiHintFor,
  buildFailedCheck,
  buildStoredCheck,
  faceIssueLabel,
  isCheckableImageType,
  needsFaceCheck,
  parseVerdict,
  readStoredCheck,
  reviewTabFor,
  shouldAutoApprove,
  sniffImageType,
  toReviewTab,
  type FaceVerdict,
} from './photo-auto-review';

const CLEAR: FaceVerdict = {
  faces: 1,
  real_photo: true,
  face_clear: true,
  appropriate: true,
  confidence: 0.95,
  issues: [],
};

const URL_A = 'https://db.neramclasses.com/storage/v1/object/public/documents/ms-avatars/u1/1.jpg';
const URL_B = 'https://db.neramclasses.com/storage/v1/object/public/profile-pictures/u1/2.jpg';
const NOW = new Date('2026-09-10T10:00:00Z');

describe('shouldAutoApprove', () => {
  it('approves one clear, real, suitable face', () => {
    expect(shouldAutoApprove(CLEAR)).toBe(true);
  });

  it.each([
    ['no face at all', { faces: 0 }],
    ['two people', { faces: 2 }],
    ['a drawing, cartoon or avatar', { real_photo: false }],
    ['a covered or unclear face', { face_clear: false }],
    ['something a school should not show', { appropriate: false }],
  ])('refuses %s', (_label, patch) => {
    expect(shouldAutoApprove({ ...CLEAR, ...patch })).toBe(false);
  });

  /** The booleans and the issue list come from the same model and can disagree.
   *  When they do, the cautious reading wins. */
  it('refuses any flagged issue even when every boolean says yes', () => {
    for (const issue of FACE_ISSUES) {
      expect(shouldAutoApprove({ ...CLEAR, issues: [issue] })).toBe(false);
    }
  });

  it('draws the confidence line exactly at the threshold', () => {
    expect(shouldAutoApprove({ ...CLEAR, confidence: AUTO_APPROVE_MIN_CONFIDENCE })).toBe(true);
    expect(shouldAutoApprove({ ...CLEAR, confidence: 0.84 })).toBe(false);
  });

  it('approves nothing when there is no verdict', () => {
    expect(shouldAutoApprove(null)).toBe(false);
    expect(shouldAutoApprove(undefined)).toBe(false);
  });
});

describe('parseVerdict', () => {
  it('reads a JSON answer', () => {
    expect(parseVerdict(JSON.stringify(CLEAR))).toEqual(CLEAR);
  });

  it('returns null for an answer it cannot use', () => {
    expect(parseVerdict('not json')).toBeNull();
    expect(parseVerdict('[]')).toBeNull();
    expect(parseVerdict({ real_photo: true })).toBeNull();
    expect(parseVerdict(null)).toBeNull();
  });

  /** A half answer must never be able to approve anything. */
  it('reads a missing boolean as false and a missing confidence as 0', () => {
    const v = parseVerdict({ faces: 1 });
    expect(v).toEqual({
      faces: 1,
      real_photo: false,
      face_clear: false,
      appropriate: false,
      confidence: 0,
      issues: [],
    });
    expect(shouldAutoApprove(v)).toBe(false);
  });

  it('clamps confidence into 0 to 1', () => {
    expect(parseVerdict({ ...CLEAR, confidence: 1.7 })?.confidence).toBe(1);
    expect(parseVerdict({ ...CLEAR, confidence: -0.2 })?.confidence).toBe(0);
  });

  it('drops unknown and repeated issues rather than failing the verdict', () => {
    const v = parseVerdict({ ...CLEAR, issues: ['face_covered', 'wearing_hat', 'face_covered', 7] });
    expect(v?.issues).toEqual(['face_covered']);
  });
});

describe('needsFaceCheck', () => {
  const pending = { photo_status: 'pending', avatar_url: URL_A, photo_ai_check: null };

  it('checks a pending photo nobody has checked', () => {
    expect(needsFaceCheck(pending, NOW)).toBe(true);
  });

  it('never checks a photo that is already decided or missing', () => {
    for (const photo_status of ['approved', 'rejected', 'missing']) {
      expect(needsFaceCheck({ ...pending, photo_status }, NOW)).toBe(false);
    }
  });

  it('has nothing to check without a photo', () => {
    expect(needsFaceCheck({ ...pending, avatar_url: null }, NOW)).toBe(false);
    expect(needsFaceCheck({ ...pending, avatar_url: '   ' }, NOW)).toBe(false);
  });

  it('does not check the same photo twice', () => {
    const check = buildStoredCheck(CLEAR, URL_A, 'gemini-2.5-flash', NOW);
    expect(needsFaceCheck({ ...pending, photo_ai_check: check }, NOW)).toBe(false);
  });

  /** The verdict carries the URL it judged. A replaced photo is a new photo, and
   *  no writer has to remember to clear the old verdict for that to hold. */
  it('checks again once the photo has been replaced', () => {
    const check = buildStoredCheck(CLEAR, URL_A, 'gemini-2.5-flash', NOW);
    expect(needsFaceCheck({ ...pending, avatar_url: URL_B, photo_ai_check: check }, NOW)).toBe(true);
  });

  it('waits before retrying a check that failed, so the page loop can finish', () => {
    const recent = buildFailedCheck(URL_A, 'Gemini API error: 500', new Date(NOW.getTime() - 60 * 60 * 1000));
    expect(needsFaceCheck({ ...pending, photo_ai_check: recent }, NOW)).toBe(false);

    const old = buildFailedCheck(URL_A, 'Gemini API error: 500', new Date(NOW.getTime() - FAILED_CHECK_RETRY_MS));
    expect(needsFaceCheck({ ...pending, photo_ai_check: old }, NOW)).toBe(true);
  });

  it('treats a record that says nothing as never checked', () => {
    expect(needsFaceCheck({ ...pending, photo_ai_check: { avatar_url: URL_A } }, NOW)).toBe(true);
  });
});

describe('reviewTabFor', () => {
  it('splits automatic approvals out of Approved', () => {
    expect(reviewTabFor({ photo_status: 'approved', photo_review_method: 'auto' })).toBe('auto');
    expect(reviewTabFor({ photo_status: 'approved', photo_review_method: 'teacher' })).toBe('approved');
  });

  /** Every approval made before this feature has a NULL method. */
  it('reads a NULL method as a teacher approval', () => {
    expect(reviewTabFor({ photo_status: 'approved', photo_review_method: null })).toBe('approved');
  });

  it('ignores a leftover method on anything that is not approved', () => {
    expect(reviewTabFor({ photo_status: 'pending', photo_review_method: 'auto' })).toBe('pending');
    expect(reviewTabFor({ photo_status: 'rejected', photo_review_method: 'auto' })).toBe('rejected');
  });

  it('falls back to missing for a value it does not know', () => {
    expect(reviewTabFor({ photo_status: 'weird' })).toBe('missing');
  });
});

describe('toReviewTab', () => {
  it('parses the status param, including the new tab', () => {
    expect(toReviewTab('auto')).toBe('auto');
    expect(toReviewTab('approved')).toBe('approved');
    expect(toReviewTab('pending')).toBe('pending');
    expect(toReviewTab('nonsense')).toBe('missing');
  });
});

describe('image types', () => {
  it('only sends types Gemini can read', () => {
    expect(isCheckableImageType('image/jpeg')).toBe(true);
    expect(isCheckableImageType('image/PNG; charset=binary')).toBe(true);
    expect(isCheckableImageType('image/webp')).toBe(true);
    expect(isCheckableImageType('image/gif')).toBe(false);
    expect(isCheckableImageType('application/octet-stream')).toBe(false);
    expect(isCheckableImageType(null)).toBe(false);
  });

  it('recognises an image from its first bytes when storage sends no useful type', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe('stored checks', () => {
  it('round trips a verdict', () => {
    const stored = buildStoredCheck(CLEAR, URL_A, 'gemini-2.5-flash', NOW);
    expect(readStoredCheck(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it('round trips a failure', () => {
    const stored = buildFailedCheck(URL_A, 'The photo took too long to download.', NOW);
    expect(readStoredCheck(stored)).toEqual(stored);
  });

  it('rejects a record with no photo url', () => {
    expect(readStoredCheck({ verdict: CLEAR })).toBeNull();
    expect(readStoredCheck('nope')).toBeNull();
  });
});

describe('aiHintFor', () => {
  const unsure = buildStoredCheck({ ...CLEAR, face_clear: false, issues: ['face_covered'] }, URL_A, 'm', NOW);

  it('says why the check kept a photo for the teacher', () => {
    expect(aiHintFor(unsure, URL_A)).toBe('AI flagged: Face covered');
  });

  it('still says something when the model was merely unsure', () => {
    const low = buildStoredCheck({ ...CLEAR, confidence: 0.5 }, URL_A, 'm', NOW);
    expect(aiHintFor(low, URL_A)).toBe('AI was not sure');
  });

  it('stays quiet about an older photo, a failed check, or a yes', () => {
    expect(aiHintFor(unsure, URL_B)).toBeNull();
    expect(aiHintFor(buildFailedCheck(URL_A, 'x', NOW), URL_A)).toBeNull();
    expect(aiHintFor(buildStoredCheck(CLEAR, URL_A, 'm', NOW), URL_A)).toBeNull();
    expect(aiHintFor(null, URL_A)).toBeNull();
  });
});

describe('labels', () => {
  it('has a plain label for every issue, with no em dash or double dash', () => {
    for (const issue of FACE_ISSUES) {
      const label = faceIssueLabel(issue);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/—|--/);
    }
  });
});

/**
 * Drift guard for the migration. The TypeScript rules above assume an audit row
 * for an automatic approval can have no reviewer, and that a teacher row always
 * does. Only the database can hold the second half, so assert it is still there.
 */
describe('photo auto approval migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/20260910100000_photo_auto_approval.sql'),
    'utf8',
  ).replace(/\s+/g, ' ');

  it('lets only an automatic decision go without a reviewer', () => {
    expect(sql).toContain('ALTER COLUMN reviewed_by DROP NOT NULL');
    expect(sql).toContain("CHECK (method = 'auto' OR reviewed_by IS NOT NULL)");
  });

  it('limits who can be recorded as approving a photo', () => {
    expect(sql).toContain(
      "CHECK (photo_review_method IS NULL OR photo_review_method IN ('teacher', 'auto'))",
    );
    expect(sql).toContain("CHECK (method IN ('teacher', 'auto'))");
  });
});

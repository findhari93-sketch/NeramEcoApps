/**
 * Turn a sideways drawing photo upright before it is drafted and reviewed.
 *
 * Students photograph sheets on phones, and a landscape sheet shot in portrait
 * (or a sheet shot from the wrong edge of the desk) arrives on its side. The
 * submit sheet already lets a student rotate before sending, and plenty do not.
 * A sideways sheet costs twice: the teacher turns their head through the whole
 * review, and the model grades "proportion" and "line" on an image whose
 * gravity is wrong.
 *
 * So, before drafting:
 *   1. Download the original and apply any EXIF orientation (sharp .rotate()).
 *   2. Show Gemini a small copy and ask which clockwise turn makes it upright.
 *   3. Only on a HIGH confidence answer that is not 0, turn the full image,
 *      upload it as a new object, and point the submission at it.
 *
 * The update is guarded four ways (same row, same original image, still
 * submitted, not yet reviewed), so a photo the student replaced, or a sheet a
 * teacher already started marking, is never swapped from under them. The old
 * object is left in storage: nothing is deleted, and a wrong turn can be undone
 * by pointing the row back at it.
 *
 * AiBlockedError propagates so the caller can stop the whole draft. Every other
 * failure is reported as a reason and the draft carries on with the photo as
 * it was, because a sheet left sideways is a nuisance, not a reason to skip it.
 */

import { AiBlockedError, generateGemini } from '@neram/ai';
import sharp from 'sharp';

import { DRAWING_EVAL_FEATURE } from '@/lib/drawing-eval/evaluate';

export type ClockwiseTurn = 0 | 90 | 180 | 270;
export type OrientationConfidence = 'high' | 'medium' | 'low';

export interface OrientationAnswer {
  rotateClockwise: ClockwiseTurn;
  confidence: OrientationConfidence;
}

export interface OrientationSubmission {
  id: string;
  student_id: string;
  original_image_url: string;
}

export interface OrientationOutcome {
  /** The image the model was asked about. */
  checkedUrl: string;
  /** The submission's image after this step: the new object when turned, else checkedUrl. */
  imageUrl: string;
  /** Clockwise degrees applied by the model's answer, or null when left as it was. */
  rotatedDeg: 90 | 180 | 270 | null;
  /** True when EXIF orientation alone changed the pixels. */
  exifApplied: boolean;
  answer: OrientationAnswer | null;
  /** Why nothing changed, when that was not the model's decision. */
  reason?: string;
}

/** Downloading our own public storage object. Anything slower is not worth waiting on. */
const FETCH_TIMEOUT_MS = 8_000;

/** Same ceiling as the evaluation's inline image cap. */
const MAX_IMAGE_BYTES = 14 * 1024 * 1024;

/** Longest side of the copy the model looks at. Orientation needs shapes, not detail. */
export const MODEL_IMAGE_MAX_SIDE = 768;

export const DRAWING_UPLOAD_BUCKET = 'drawing-uploads';

export const ORIENTATION_SCHEMA = {
  type: 'object',
  properties: {
    rotateClockwise: { type: 'integer', enum: [0, 90, 180, 270] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['rotateClockwise', 'confidence'],
};

export const ORIENTATION_INSTRUCTION = [
  'You check whether a photographed drawing sheet is the right way up.',
  'Decide how many degrees the image must be turned CLOCKWISE so the drawing is upright, the way the student drew it: 0, 90, 180 or 270.',
  'Use the evidence on the sheet: handwriting, labels and names read left to right on horizontal lines; ground lines, table tops and horizons run along the bottom; objects stand on their bases and are pulled down by gravity; trees, people and buildings point upward; shadows fall below or beside the objects that cast them.',
  'The orientation of the paper alone is not evidence. A landscape drawing on a landscape sheet is upright.',
  'Set confidence to "high" only when the evidence clearly points one way. Use "medium" or "low" for abstract patterns, symmetrical geometric compositions, or when you cannot tell. When unsure, answer 0.',
].join(' ');

const TURNS: readonly ClockwiseTurn[] = [0, 90, 180, 270];

/** Read the model's answer. Anything outside the contract is treated as no answer. */
export function parseOrientation(text: string): OrientationAnswer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const root = parsed as { rotateClockwise?: unknown; confidence?: unknown };
  const turn = Number(root?.rotateClockwise);
  if (!TURNS.includes(turn as ClockwiseTurn)) return null;
  const confidence = root?.confidence;
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') return null;
  return { rotateClockwise: turn as ClockwiseTurn, confidence };
}

/**
 * Whether to write a new image, and by how much to turn it.
 *
 * Only a confident, non-zero answer turns a sheet: a wrong turn is worse than
 * no turn, because it happens silently and the teacher assumes the student
 * sent it that way. EXIF alone is a reason to write the upright pixels, since
 * not every viewer honours the tag.
 */
export function decideRotation(
  answer: OrientationAnswer | null,
  exifApplied: boolean,
): { turn: ClockwiseTurn; write: boolean } {
  const turn: ClockwiseTurn = answer && answer.confidence === 'high' ? answer.rotateClockwise : 0;
  return { turn, write: turn !== 0 || exifApplied };
}

async function download(url: string): Promise<Buffer | { reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { reason: `The photo could not be downloaded (${res.status}).` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return { reason: 'The photo file is empty.' };
    if (buf.byteLength > MAX_IMAGE_BYTES) return { reason: 'The photo is too large to turn.' };
    return buf;
  } catch {
    return {
      reason: controller.signal.aborted ? 'The photo took too long to download.' : 'The photo could not be downloaded.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The same public address the upload route hands the student's phone. */
function publicUrlFor(admin: any, path: string): string {
  const { data } = admin.storage.from(DRAWING_UPLOAD_BUCKET).getPublicUrl(path);
  return data?.publicUrl as string;
}

export async function detectAndFixOrientation(
  admin: any,
  submission: OrientationSubmission,
  opts: { actorId?: string | null } = {},
): Promise<OrientationOutcome> {
  const checkedUrl = submission.original_image_url;
  const unchanged = (reason?: string, answer: OrientationAnswer | null = null, exifApplied = false): OrientationOutcome => ({
    checkedUrl,
    imageUrl: checkedUrl,
    rotatedDeg: null,
    exifApplied,
    answer,
    reason,
  });

  const original = await download(checkedUrl);
  if (!Buffer.isBuffer(original)) return unchanged(original.reason);

  let exifApplied = false;
  let preview: Buffer;
  try {
    const meta = await sharp(original).metadata();
    exifApplied = typeof meta.orientation === 'number' && meta.orientation > 1;
    preview = await sharp(original)
      .rotate()
      .resize({ width: MODEL_IMAGE_MAX_SIDE, height: MODEL_IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return unchanged('The photo could not be read as an image.');
  }

  let answer: OrientationAnswer | null = null;
  try {
    const res = await generateGemini({
      feature: DRAWING_EVAL_FEATURE,
      systemInstruction: ORIENTATION_INSTRUCTION,
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: preview.toString('base64') } },
        { text: 'Which clockwise turn makes this drawing upright?' },
      ],
      responseMimeType: 'application/json',
      responseSchema: ORIENTATION_SCHEMA,
      temperature: 0,
      // Thinking models count reasoning against this ceiling, so it cannot be tiny.
      maxOutputTokens: 1024,
      actorId: opts.actorId ?? null,
    });
    answer = parseOrientation(res.text);
  } catch (err) {
    if (err instanceof AiBlockedError) throw err;
    return unchanged('The orientation check could not run.', null, exifApplied);
  }

  const { turn, write } = decideRotation(answer, exifApplied);
  if (!write) return unchanged(undefined, answer, exifApplied);

  let upright: Buffer;
  try {
    upright = await sharp(original).rotate().rotate(turn).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return unchanged('The photo could not be turned.', answer, exifApplied);
  }

  const path = `${submission.student_id}/auto-upright-${Date.now()}.jpg`;
  const { error: uploadError } = await admin.storage
    .from(DRAWING_UPLOAD_BUCKET)
    .upload(path, upright, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) return unchanged('The turned photo could not be stored.', answer, exifApplied);

  const imageUrl = publicUrlFor(admin, path);
  if (!imageUrl) return unchanged('The turned photo has no public address.', answer, exifApplied);

  const rotatedDeg = turn === 0 ? null : turn;
  const { data: updated, error: updateError } = await admin
    .from('drawing_submissions')
    .update({ original_image_url: imageUrl, auto_rotated_deg: rotatedDeg })
    .eq('id', submission.id)
    .eq('original_image_url', checkedUrl)
    .eq('status', 'submitted')
    .is('reviewed_image_url', null)
    .select('id');

  if (updateError || !Array.isArray(updated) || updated.length !== 1) {
    // Someone changed the sheet meanwhile. Their version stands.
    return unchanged('The sheet changed while it was being turned, so it was left alone.', answer, exifApplied);
  }

  return { checkedUrl, imageUrl, rotatedDeg, exifApplied, answer };
}

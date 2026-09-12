/**
 * Voice feedback on drawing reviews: what a recording is, where it lives, and
 * what "the student heard it" means.
 *
 * Pure, with no DOM and no database, so the recorder in the browser, the upload
 * route and the listen route all read one set of rules and cannot drift apart.
 */
import { formatClock } from '../components/video/format';

/** Three minutes. Long enough to walk through a drawing, short enough to finish. */
export const RECORDING_CAP_MS = 180_000;

/** Anything shorter is an accidental tap, not a note. */
export const RECORDING_MIN_MS = 1_000;

/** Mono speech at 48 kbps is about 0.36 MB a minute and still sounds like a person. */
export const RECORDING_BITS_PER_SECOND = 48_000;

/** How far through a note a student must get for it to count as heard. */
export const HEARD_FULLY_RATIO = 0.9;

/** Private bucket. Reads and writes go through short-lived signed URLs only. */
export const VOICE_FEEDBACK_BUCKET = 'drawing-voice-feedback';

/**
 * Formats to ask MediaRecorder for, best first.
 *
 * AAC in MP4 leads because it is the one container every phone plays back.
 * WebM Opus is what Chrome records by default, but iPhones on iOS 15.4 to 17.3
 * refuse it in an audio element, so it is the fallback rather than the default.
 * Plain audio/mp4 is Safari, which answers no to any string carrying a codec.
 */
const MIME_PREFERENCE = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

const EXT_BY_CONTAINER: Record<string, 'm4a' | 'webm' | 'ogg'> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function pickRecordingMime(isTypeSupported: (mime: string) => boolean): string | null {
  for (const mime of MIME_PREFERENCE) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // Some embedded browsers ship a MediaRecorder stub that throws here.
    }
  }
  return null;
}

function container(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase();
}

export function extForMime(mime: string): 'm4a' | 'webm' | 'ogg' | null {
  return EXT_BY_CONTAINER[container(mime)] ?? null;
}

export function isAllowedVoiceMime(mime: string): boolean {
  return extForMime(mime) !== null;
}

/**
 * The content type to store a recording under: the container alone. The bucket's
 * allow list names containers, and MediaRecorder hands back codec parameters.
 */
export function voiceContentType(mime: string): string {
  return container(mime);
}

/** `{submissionId}/{noteId}.{ext}`. The server mints it; the browser never chooses. */
export function voiceNotePath(submissionId: string, noteId: string, mime: string): string {
  const ext = extForMime(mime);
  if (!ext) throw new Error(`Not a voice note format: ${mime}`);
  return `${submissionId}/${noteId}.${ext}`;
}

/**
 * Whether a path the browser hands back is one the server could have minted for
 * THIS submission. Anything else (another student's folder, traversal, a nested
 * path, a non-audio extension) is refused before it can be written to a row.
 */
export function isVoiceNotePathFor(submissionId: string, path: string): boolean {
  if (!new RegExp(`^${UUID}$`, 'i').test(submissionId)) return false;
  return new RegExp(`^${submissionId}/${UUID}\\.(m4a|webm|ogg)$`, 'i').test(path);
}

export type HeardState = 'unsent' | 'unheard' | 'partial' | 'full';

export interface HeardFields {
  sent_at: string | null;
  first_played_at: string | null;
  heard_fully_at: string | null;
}

export function heardState(v: HeardFields | null | undefined): HeardState {
  if (!v || !v.sent_at) return 'unsent';
  if (v.heard_fully_at) return 'full';
  if (v.first_played_at) return 'partial';
  return 'unheard';
}

export function heardLabel(state: HeardState): string {
  switch (state) {
    case 'full':
      return 'Heard';
    case 'partial':
      return 'Partly heard';
    case 'unheard':
      return 'Not heard yet';
    default:
      return 'Draft';
  }
}

function agoText(iso: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface VoiceStatusFields extends HeardFields {
  max_position_ms: number;
  duration_ms: number;
}

/** One line under the teacher's copy of a note: where it is and whether it landed. */
export function voiceStatusLine(v: VoiceStatusFields, nowMs: number): string {
  if (!v.sent_at) return 'Saved. It goes out with Redo or Complete.';
  const sent = `Sent ${agoText(v.sent_at, nowMs)}.`;
  const state = heardState(v);
  if (state === 'full') return `${sent} Heard fully ${agoText(v.heard_fully_at as string, nowMs)}.`;
  if (state === 'partial') {
    return `${sent} Stopped at ${formatClock(v.max_position_ms / 1000)} of ${formatClock(v.duration_ms / 1000)}.`;
  }
  return `${sent} Not heard yet.`;
}

export interface ListenFields {
  first_played_at: string | null;
  max_position_ms: number;
  heard_fully_at: string | null;
  play_count: number;
}

export interface ListenReport {
  positionMs: number;
  ended: boolean;
  /** True on the first report of a play session, so replays are counted once each. */
  started: boolean;
  durationMs: number;
  now: string;
}

/**
 * Fold one playback report into the receipt.
 *
 * Only ever moves forward. A student who heard a note through and then replays
 * the first five seconds is still someone who heard it through, so the furthest
 * point never shrinks and the heard-fully stamp is never cleared or re-dated.
 * `ended` counts even when the reported time falls short, because browsers fire
 * it with currentTime a few hundred milliseconds under the duration.
 */
export function applyListen(prev: ListenFields, report: ListenReport): ListenFields {
  const duration = Math.max(0, Number(report.durationMs) || 0);
  const raw = Number(report.positionMs);
  const position = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), duration) : 0;
  const furthest = Math.max(prev.max_position_ms || 0, position);
  const reachedEnd = report.ended || (duration > 0 && furthest >= duration * HEARD_FULLY_RATIO);
  const played = report.started || report.ended || position > 0;

  return {
    first_played_at: prev.first_played_at ?? (played ? report.now : null),
    max_position_ms: Math.round(furthest),
    heard_fully_at: prev.heard_fully_at ?? (reachedEnd ? report.now : null),
    play_count: (prev.play_count || 0) + (report.started ? 1 : 0),
  };
}

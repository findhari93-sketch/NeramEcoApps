/**
 * Which audio format to ask MediaRecorder for. Pure, no DOM, so server routes
 * that check an uploaded recording read the same list as the browser that made it.
 *
 * Shared by Nexus voice feedback and the Marketing review link.
 */

/**
 * Formats to ask MediaRecorder for, best first.
 *
 * AAC in MP4 leads because it is the one container every phone plays back.
 * WebM Opus is what Chrome records by default, but iPhones on iOS 15.4 to 17.3
 * refuse it in an audio element, so it is the fallback rather than the default.
 * Plain audio/mp4 is Safari, which answers no to any string carrying a codec.
 */
export const RECORDING_MIME_PREFERENCE = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

/** Mono speech at 48 kbps is about 0.36 MB a minute and still sounds like a person. */
export const DEFAULT_RECORDING_BITS_PER_SECOND = 48_000;

export function pickRecordingMime(isTypeSupported: (mime: string) => boolean): string | null {
  for (const mime of RECORDING_MIME_PREFERENCE) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      // Some embedded browsers ship a MediaRecorder stub that throws here.
    }
  }
  return null;
}

/** "audio/webm;codecs=opus" to "audio/webm". MediaRecorder hands back codec parameters. */
export function recordingContainer(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase();
}

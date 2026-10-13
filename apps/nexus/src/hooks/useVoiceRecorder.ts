'use client';

/**
 * Microphone to Blob, for voice feedback.
 *
 * The recorder itself lives in @neram/ui (shared with the Marketing review link);
 * this wrapper keeps the drawing-feedback cap and bitrate as the defaults, so the
 * call sites read exactly as before.
 */
import { useVoiceRecorder as useSharedVoiceRecorder } from '@neram/ui/hooks';
import { RECORDING_BITS_PER_SECOND, RECORDING_CAP_MS } from '@/lib/voice-recording';

export type { RecorderStatus, FinishedRecording } from '@neram/ui/hooks';

export function useVoiceRecorder(capMs: number = RECORDING_CAP_MS) {
  return useSharedVoiceRecorder({ capMs, bitsPerSecond: RECORDING_BITS_PER_SECOND });
}

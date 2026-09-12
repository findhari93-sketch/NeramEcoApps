'use client';

import { useCallback } from 'react';
import type { VoiceProgressReport } from './VoiceNotePlayer';

/**
 * Sends a student's playback progress to the listen route, which is how the
 * teacher comes to see "Heard". Best effort: a receipt that fails to send must
 * never interrupt the listening. `keepalive` gives the last report a chance to
 * leave while the page is closing.
 */
export function useVoiceListenReporter(
  getToken: () => Promise<string | null>,
  voiceId: string | null | undefined,
) {
  return useCallback(
    async (report: VoiceProgressReport) => {
      if (!voiceId) return;
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(`/api/drawing/voice-feedback/${voiceId}/listen`, {
          method: 'POST',
          keepalive: true,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position_ms: report.positionMs,
            ended: report.ended,
            started: report.started,
          }),
        });
      } catch {
        // A lost receipt is not worth a visible error.
      }
    },
    [getToken, voiceId],
  );
}

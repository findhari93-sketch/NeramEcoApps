'use client';

import { useCallback, useRef, useState } from 'react';
import { addPlayed, type PlayedRange } from '@/lib/played-ranges';
import { MAX_TICK_GAP_SECONDS } from '@/lib/watch-progress';

/**
 * What this student has actually played of one recording, for computeGate's
 * `playedRanges`.
 *
 * Seeded from the server's credited point (a prefix: see creditedPlayedUntil),
 * then grown by the player's ticks. Only a step of real playback counts: a gap
 * larger than MAX_TICK_GAP_SECONDS between two ticks is a seek, the same rule
 * the progress heartbeat uses for watched seconds, so a drag adds nothing.
 *
 * The ranges live in a ref and are committed to state only when the played
 * total moves by a whole second or a new stretch starts. Ticks arrive four
 * times a second, and the gate does not need to be recomputed for each one.
 */
export default function usePlayedRanges() {
  const rangesRef = useRef<PlayedRange[]>([]);
  const lastTickRef = useRef<number | null>(null);
  const [ranges, setRanges] = useState<PlayedRange[]>([]);

  const commit = useCallback((next: PlayedRange[]) => {
    const before = rangesRef.current;
    rangesRef.current = next;
    const total = (rs: PlayedRange[]) => rs.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (next.length !== before.length || Math.floor(total(next)) !== Math.floor(total(before))) {
      setRanges(next);
    }
  }, []);

  /** The server's credited point: everything before it counts as played. */
  const seed = useCallback(
    (playedUntil: number) => {
      if (Number.isFinite(playedUntil) && playedUntil > 0) {
        commit(addPlayed(rangesRef.current, 0, playedUntil));
      }
    },
    [commit],
  );

  /** Hand every player tick here. */
  const record = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      const last = lastTickRef.current;
      lastTickRef.current = seconds;
      if (last === null) return;
      const gap = seconds - last;
      if (gap > 0 && gap <= MAX_TICK_GAP_SECONDS) {
        commit(addPlayed(rangesRef.current, last, seconds));
      }
    },
    [commit],
  );

  return { ranges, seed, record };
}

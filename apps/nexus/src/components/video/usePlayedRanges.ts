'use client';

import { useCallback, useRef, useState } from 'react';
import { addPlayed, mergeRanges, type PlayedRange } from '@/lib/played-ranges';

/**
 * What this student has actually played of one recording, for computeGate's
 * `playedRanges` and the scrub bar.
 *
 * Seeded from the server (the stored ranges, or a prefix from an older reply),
 * then grown by the spans the player reports through onPlayedSpan. Deciding
 * what counts as played is the player's job (lib/playback-steps.ts), so a drag
 * never arrives here and a late tick on a busy phone still does.
 *
 * The ranges live in a ref and are committed to state only when the played
 * total moves by a whole second or a new stretch starts. Spans arrive four
 * times a second, and the gate does not need to be recomputed for each one.
 */
export default function usePlayedRanges(initial?: ReadonlyArray<PlayedRange>) {
  const rangesRef = useRef<PlayedRange[]>(initial ? mergeRanges(initial) : []);
  const [ranges, setRanges] = useState<PlayedRange[]>(rangesRef.current);

  const commit = useCallback((next: PlayedRange[]) => {
    const before = rangesRef.current;
    rangesRef.current = next;
    const total = (rs: PlayedRange[]) => rs.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (next.length !== before.length || Math.floor(total(next)) !== Math.floor(total(before))) {
      setRanges(next);
    }
  }, []);

  /** A server prefix: everything before it counts as played. */
  const seed = useCallback(
    (playedUntil: number) => {
      if (Number.isFinite(playedUntil) && playedUntil > 0) {
        commit(addPlayed(rangesRef.current, 0, playedUntil));
      }
    },
    [commit],
  );

  /** Stored ranges from the server, added to whatever this page already has. */
  const seedRanges = useCallback(
    (stored: ReadonlyArray<PlayedRange>) => {
      commit(mergeRanges([...rangesRef.current, ...stored]));
    },
    [commit],
  );

  /** Hand every span the player reports here. */
  const addSpan = useCallback(
    (from: number, to: number) => {
      commit(addPlayed(rangesRef.current, from, to));
    },
    [commit],
  );

  return { ranges, seed, seedRanges, addSpan, rangesRef };
}

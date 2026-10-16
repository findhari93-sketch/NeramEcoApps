/**
 * The "we trimmed this for you" line above a recap's player (founder,
 * 2026-10-16). A student sees 53:51 on the player and has no way to know the
 * class was 65:45 before the setup and silences came out, so the saving was
 * invisible and the trim looked like it had not happened.
 *
 * Pure, so the wording is tested once and every surface says the same thing.
 */

/** Below this the saving is not worth a sentence. */
const MIN_SAVING_SECONDS = 60;

/** Player-style clock: 53:51, or 1:05:45 past the hour. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface TrimSaving {
  watch: string;
  original: string;
  savedMinutes: number;
}

/**
 * What to tell the student, or null when there is nothing worth saying: no
 * trim, a trim under a minute, or a recap whose length is unknown.
 */
export function describeTrimSaving(
  watchSeconds: number | null | undefined,
  removedSeconds: number | null | undefined,
): TrimSaving | null {
  if (!watchSeconds || watchSeconds <= 0) return null;
  if (!removedSeconds || removedSeconds < MIN_SAVING_SECONDS) return null;
  return {
    watch: clock(watchSeconds),
    original: clock(watchSeconds + removedSeconds),
    savedMinutes: Math.round(removedSeconds / 60),
  };
}

/**
 * Times the way a video player shows them: "15:24", "1:02:38".
 *
 * The checkpoint editor used to take raw seconds, so a teacher who paused the
 * recording at 15:24 had to type 924. This reads what they see and writes it
 * back the same way. Plain seconds are still accepted, so nothing anyone was
 * already typing stops working.
 *
 * Pure TypeScript, no JSX, so the editor, the validator and the tests share it.
 */

import { formatClock } from './recap-sections';

const DIGITS = /^\d+$/;

/**
 * "m:ss", "h:mm:ss" or plain seconds, into seconds. Null for anything else.
 *
 * Minutes may run past 59 when no hours are given ("62:03"), because that is how
 * a long recording's position is often read out. Seconds never may, and neither
 * may minutes once hours are present: "15:60" is a typo, not 16:00.
 */
export function parseTimecode(input: string): number | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;

  const parts = value.split(':');
  if (parts.length > 3) return null;
  // Rejects empty parts (":30", "12:"), signs and decimals in one check.
  if (!parts.every((part) => DIGITS.test(part))) return null;

  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];

  const last = parts[parts.length - 1];
  const seconds = nums[nums.length - 1];
  if (last.length > 2 || seconds > 59) return null;

  if (nums.length === 2) return nums[0] * 60 + seconds;

  const [hours, minutes] = nums;
  if (parts[1].length > 2 || minutes > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Seconds as "m:ss", or "h:mm:ss" from an hour.
 *
 * `forceHours` pads a short time to "0:15:24" so a column of start and end
 * times on a long recording lines up.
 */
export function formatTimecode(seconds: number, opts: { forceHours?: boolean } = {}): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (!opts.forceHours || safe >= 3600) return formatClock(safe);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `0:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

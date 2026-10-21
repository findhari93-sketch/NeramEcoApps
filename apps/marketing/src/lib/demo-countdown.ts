/**
 * Time left until a confirmed demo, for the header chip and the My demo card.
 * Pure: callers own the clock.
 */

export type DemoPhase = 'later' | 'soon' | 'live' | 'over';

export interface DemoCountdown {
  phase: DemoPhase;
  /** Whole units left until the start (all 0 once live). */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Chip text: "2d 4h", "10h 12m", "12 min", "Live", "" when over. */
  short: string;
  /** Phone chip text, one unit: "2d", "10h", "12m", "Live". */
  tiny: string;
  /** Sentence for screen readers and subtitles. */
  label: string;
}

const MIN = 60_000;

export function demoCountdown(start: Date, durationMinutes: number, now: Date): DemoCountdown {
  const left = start.getTime() - now.getTime();
  const end = start.getTime() + durationMinutes * MIN;
  const zero = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  if (now.getTime() > end) return { phase: 'over', ...zero, short: '', tiny: '', label: 'This demo class has ended' };
  if (left <= 0) return { phase: 'live', ...zero, short: 'Live', tiny: 'Live', label: 'Your demo class is live now' };

  const totalSec = Math.floor(left / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  // Minutes round up for display, so "starts in 0 min" never shows.
  const upMin = Math.ceil(left / MIN);
  let short: string;
  let label: string;
  if (days > 0) {
    short = hours ? `${days}d ${hours}h` : `${days}d`;
    label = `Starts in ${days} ${days === 1 ? 'day' : 'days'}${hours ? ` ${hours} ${hours === 1 ? 'hour' : 'hours'}` : ''}`;
  } else if (upMin >= 60) {
    const h = Math.floor(upMin / 60);
    const m = upMin % 60;
    short = m ? `${h}h ${m}m` : `${h}h`;
    label = `Starts in ${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${m} min` : ''}`;
  } else {
    short = `${upMin} min`;
    label = `Starts in ${upMin} min`;
  }
  const tiny = days > 0 ? `${days}d` : upMin >= 60 ? `${Math.floor(upMin / 60)}h` : `${upMin}m`;
  // "soon" is the join window (15 minutes before), matching isJoinOpen.
  return { phase: left <= 15 * MIN ? 'soon' : 'later', days, hours, minutes, seconds, short, tiny, label };
}

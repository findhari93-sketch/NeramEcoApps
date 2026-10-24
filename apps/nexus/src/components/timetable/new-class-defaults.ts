/**
 * The standard class a new timetable entry opens with. Almost every class is the
 * evening JEE/NATA session with a Teams meeting, so Add Class starts from that
 * and the teacher only edits what differs.
 */
export const STANDARD_CLASS = {
  title: 'JEE/NATA Preparation',
  start_time: '19:00',
  end_time: '20:30',
  create_meeting: true,
} as const;

/** Standard class length, in minutes. */
const STANDARD_MINUTES = 90;

/** Last end time the time picker offers (TIME_OPTIONS stops at 22:00). */
const LATEST_END = 22 * 60;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Start and end for a new class. No clicked slot gives the standard evening
 * time; a clicked week-view slot keeps its start and runs the standard length,
 * capped at the last time the picker can show.
 */
export function newClassTimes(prefillTime?: string): { start_time: string; end_time: string } {
  if (!prefillTime) {
    return { start_time: STANDARD_CLASS.start_time, end_time: STANDARD_CLASS.end_time };
  }
  const end = Math.min(toMinutes(prefillTime) + STANDARD_MINUTES, LATEST_END);
  return { start_time: prefillTime, end_time: toHHMM(end) };
}

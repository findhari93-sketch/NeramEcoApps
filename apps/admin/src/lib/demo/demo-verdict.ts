/**
 * Did the demo happen? Decided from what Teams saw, so staff only step in
 * when the evidence is unclear. Pure, safe in client components.
 *
 * Held      a student (anyone outside Neram) was in the meeting together with
 *           the team for HELD_MINUTES or more around the booked time, or the
 *           transcript shows a real two-way conversation that long.
 * No-show   an hour after the booked end, the team was in the meeting and
 *           nobody else ever joined around the booked time.
 * Unclear   anything else: a short visit, a session at another time, nobody
 *           at all (the demo may have moved to WhatsApp), or Teams unreadable.
 *           Status stays as it is and the desk asks a person.
 *
 * "Around the booked time" is an hour before the start to three hours after
 * the end, so a test the evening before never counts as the demo.
 */

import type { DemoAttendee, DemoRecordingFile } from './teams-evidence';
import type { DemoTranscriptStats } from './demo-transcript';

const MIN = 60_000;
export const HELD_MINUTES = 15;
/** After the booked end, before nobody-came becomes No-show. */
export const NO_SHOW_AFTER_END_MIN = 60;
const WINDOW_BEFORE_MIN = 60;
const WINDOW_AFTER_END_MIN = 180;
/** Transcript-only proof: both sides talked, and for long enough. */
const TRANSCRIPT_WORDS = 100;

export interface DemoVerdict {
  kind: 'held' | 'no_show' | 'unclear';
  reason: string;
  /** The student as Teams named them, when one joined. */
  guest: string | null;
  /** Minutes that guest spent with the team around the booked time. */
  together: number;
  /** Words the student spoke in the transcript, when there is one. */
  guestWords: number | null;
  at: string;
}

type Span = [number, number];

export function demoWindow(startIso: string, minutes: number): { from: number; to: number; end: number } {
  const start = new Date(startIso).getTime();
  const end = start + minutes * MIN;
  return { from: start - WINDOW_BEFORE_MIN * MIN, to: end + WINDOW_AFTER_END_MIN * MIN, end };
}

function spansOf(a: DemoAttendee): Span[] {
  const list = a.intervals?.length
    ? a.intervals.map((i) => [new Date(i.join).getTime(), new Date(i.leave).getTime()] as Span)
    : a.firstJoin && a.lastLeave
      ? [[new Date(a.firstJoin).getTime(), new Date(a.lastLeave).getTime()] as Span]
      : [];
  return list.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
}

function clip(spans: Span[], from: number, to: number): Span[] {
  return spans.map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as Span).filter(([s, e]) => e > s);
}

function union(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

const total = (spans: Span[]) => union(spans).reduce((n, [s, e]) => n + (e - s), 0);

function overlap(a: Span[], b: Span[]): number {
  let n = 0;
  for (const [s1, e1] of union(a)) for (const [s2, e2] of union(b)) n += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
  return n;
}

const mins = (ms: number) => Math.round(ms / MIN);

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? 'the team';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Milliseconds each guest was in the meeting, and with at least one team member, between `from` and `to`. */
export function timeTogether(attendance: DemoAttendee[], from: number, to: number) {
  const teamSpans = clip(attendance.filter((a) => a.staff).flatMap(spansOf), from, to);
  return attendance
    .filter((a) => !a.staff)
    .map((g) => {
      const own = clip(spansOf(g), from, to);
      return { guest: g, present: total(own), together: overlap(own, teamSpans) };
    })
    .sort((a, b) => b.together - a.together || b.present - a.present);
}

/** The verdict, or null while it is too early to say. `transcript` is optional evidence. */
export function demoVerdict(input: {
  start: string;
  minutes: number;
  attendance: DemoAttendee[] | null;
  transcript: DemoTranscriptStats | null;
  now: Date;
}): Omit<DemoVerdict, 'at'> | null {
  const { attendance, transcript, now } = input;
  const w = demoWindow(input.start, input.minutes);
  const t = now.getTime();
  if (t < new Date(input.start).getTime() + HELD_MINUTES * MIN) return null;

  const list = attendance ?? [];
  const best = timeTogether(list, w.from, w.to)[0];
  const team = list.filter((a) => a.staff && clip(spansOf(a), w.from, w.to).length > 0);
  const teamNames = names(team.map((a) => a.name.split(' ')[0]));
  const words = transcript ? transcript.guestWords : null;
  const spoke =
    words === null ? '' : words > 0 ? ` The transcript has ${words} words from the student.` : ' The student did not speak in the transcript.';

  if (best && best.together >= HELD_MINUTES * MIN) {
    return {
      kind: 'held',
      reason: `${best.guest.name} was in the meeting with ${teamNames} for ${mins(best.together)} min.${spoke}`,
      guest: best.guest.name,
      together: mins(best.together),
      guestWords: words,
    };
  }

  // The transcript alone: attendance unreadable or oddly short, but a real conversation took place.
  if (
    transcript &&
    transcript.minutes >= HELD_MINUTES &&
    transcript.guestWords >= TRANSCRIPT_WORDS &&
    transcript.staffWords >= TRANSCRIPT_WORDS
  ) {
    const student = transcript.speakers.find((s) => !s.staff && s.name !== 'Unknown speaker');
    return {
      kind: 'held',
      reason: `The transcript shows ${transcript.minutes} min of conversation, with ${transcript.guestWords} words from ${student?.name ?? 'the student'}.`,
      guest: student?.name ?? best?.guest.name ?? null,
      together: best ? mins(best.together) : 0,
      guestWords: transcript.guestWords,
    };
  }

  if (t < w.end + NO_SHOW_AFTER_END_MIN * MIN) return null;

  if (best && best.present > 0) {
    return {
      kind: 'unclear',
      reason: `${best.guest.name} was with the team for ${mins(best.together)} min only. Was the demo held?`,
      guest: best.guest.name,
      together: mins(best.together),
      guestWords: words,
    };
  }

  // Someone met the team at another time: maybe the demo moved, maybe a test.
  const elsewhere = timeTogether(list, -Infinity, Infinity)[0];
  if (elsewhere && elsewhere.together >= HELD_MINUTES * MIN) {
    const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(
      new Date(elsewhere.guest.firstJoin ?? input.start),
    );
    return {
      kind: 'unclear',
      reason: `${elsewhere.guest.name} met the team for ${mins(elsewhere.together)} min on ${day}, not at the booked time. Mark what happened.`,
      guest: elsewhere.guest.name,
      together: 0,
      guestWords: words,
    };
  }

  const waited = total(clip(team.flatMap(spansOf), w.from, w.to));
  if (attendance && waited >= 5 * MIN) {
    return {
      kind: 'no_show',
      reason: `Nobody outside Neram joined. ${teamNames} waited ${mins(waited)} min.`,
      guest: null,
      together: 0,
      guestWords: words,
    };
  }

  return {
    kind: 'unclear',
    reason: attendance
      ? 'Nobody joined the Teams meeting at the booked time. If the demo happened elsewhere, use Held at another time.'
      : 'Teams attendance could not be read, so the desk cannot tell. Mark what happened.',
    guest: null,
    together: 0,
    guestWords: words,
  };
}

export type VerdictAction = 'mark_attended' | 'mark_no_show' | null;

/**
 * What the check may change. Staff marks are final (an older row with no
 * source counts as staff); a Teams No-show turns into Attended when a late
 * student shows up in a later report. Held is never undone by the machine,
 * since the evidence only grows.
 */
export function verdictAction(
  status: string,
  source: 'teams' | 'staff' | null | undefined,
  verdict: Pick<DemoVerdict, 'kind'> | null,
): VerdictAction {
  if (!verdict) return null;
  if (status === 'approved') return verdict.kind === 'held' ? 'mark_attended' : verdict.kind === 'no_show' ? 'mark_no_show' : null;
  if (status === 'no_show' && source === 'teams' && verdict.kind === 'held') return 'mark_attended';
  return null;
}

const IST_MS = 330 * MIN;

/**
 * The first follow-up call after an automatic Attended: two hours after the
 * booked end while the demo is fresh, moved to 10:00 IST when that lands
 * outside 9:00 to 19:00, or already passed.
 */
export function autoFollowUpAt(endMs: number, now: Date = new Date()): Date {
  const due = Math.max(endMs + 120 * MIN, now.getTime() + 30 * MIN);
  const ist = new Date(due + IST_MS);
  const h = ist.getUTCHours();
  if (h >= 9 && h < 19) return new Date(due);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + (h >= 19 ? 1 : 0), 10, 0) - IST_MS);
}

/** The recording of the real demo: made around the booked time, the longest wins (a test run is short). */
export function autoPickRecording(files: DemoRecordingFile[], startIso: string, minutes: number): DemoRecordingFile | null {
  const w = demoWindow(startIso, minutes);
  const near = files.filter((f) => {
    const at = new Date(f.createdAt).getTime();
    return at >= w.from && at <= w.end + 6 * 60 * MIN;
  });
  return near.sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0) || b.size - a.size)[0] ?? null;
}

/**
 * What the teacher console shows, and the small rules behind its controls.
 * Pure, so the console's states and the key selector are unit tested.
 */

import { promptTitle } from './format';
import type { AnswerType, HistoryEntry, ParticipationRow, PromptCounts, TeacherPrompt, TeacherSnapshot, WaitingStudent } from './types';

export type ConsoleView =
  | { kind: 'loading' }
  | { kind: 'ended' }
  | { kind: 'ready' }
  | { kind: 'open'; prompt: TeacherPrompt; answered: number; enrolled: number; offRoster: number }
  | { kind: 'closed'; prompt: TeacherPrompt; decided: boolean }
  | { kind: 'revealed'; prompt: TeacherPrompt };

export function deriveConsoleView(snapshot: TeacherSnapshot | null): ConsoleView {
  if (!snapshot) return { kind: 'loading' };
  if (snapshot.session.status === 'ended') return { kind: 'ended' };

  const prompt = snapshot.prompt;
  if (!prompt) return { kind: 'ready' };

  if (prompt.state === 'open') {
    const counts = snapshot.counts;
    // Out of the students who JOINED this round (opened the pad; it never drops,
    // never counts staff), less anyone the teacher excused. The class list is
    // the fallback for a server that does not send it yet.
    const joined = counts?.joined;
    return {
      kind: 'open',
      prompt,
      answered: joined === undefined ? (counts?.answered ?? prompt.answered_count) : (counts?.answered_joined ?? 0),
      enrolled: joined === undefined ? (counts?.enrolled ?? snapshot.readiness.enrolled) : Math.max(0, joined - (counts?.excused_joined ?? 0)),
      offRoster: counts?.answered_off_roster ?? 0,
    };
  }
  if (prompt.state === 'closed') {
    return { kind: 'closed', prompt, decided: prompt.ungraded || (effectiveKeys(prompt)?.length ?? 0) > 0 };
  }
  return { kind: 'revealed', prompt };
}

/** What a screen reader says when the console changes state. The live counter is not announced. */
export function consoleAnnouncement(view: ConsoleView): string {
  switch (view.kind) {
    case 'loading':
      return 'Loading the console.';
    case 'ended':
      return 'Round ended.';
    case 'ready':
      return 'Ready to ask.';
    case 'open':
      return `${promptTitle(view.prompt)} is open.`;
    case 'closed':
      return `${promptTitle(view.prompt)} closed.`;
    case 'revealed':
      return `${promptTitle(view.prompt)} revealed.`;
  }
}

/**
 * A question's chip in Questions so far. A closed question that is not the one
 * on screen is waiting for its answer ("answer later"), which is what the
 * teacher chose by asking the next question or by pressing Decide later.
 */
export function historyChipLabel(entry: HistoryEntry, waiting: boolean): string {
  const title = promptTitle(entry);
  if (entry.state === 'revealed') return entry.ungraded ? `${title} poll` : `${title}  ${entry.correct} of ${entry.answered}`;
  if (entry.state === 'closed' && waiting) return `${title} answer later`;
  return `${title} ${entry.state}`;
}

/** The answer counts for a closed question, from its named rows (the same numbers the snapshot's groups carry). */
export function groupsFromParticipation(rows: readonly ParticipationRow[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.participation !== 'answered' || row.answer === null) continue;
    counts.set(row.answer, (counts.get(row.answer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** What POST /api/pad/sessions/:id/resend answers. */
export interface ReminderResult {
  recipients: number;
  sent: number;
  partial: number;
  failed: number;
  notConnected: number;
  skipped: 'no-meeting' | 'no-bot' | 'nobody-to-remind' | null;
}

/** What the teacher reads after "Remind students without the pad". */
export function reminderMessage(result: ReminderResult): string {
  if (result.skipped === 'no-meeting' || result.skipped === 'no-bot') {
    return 'Reminders need the meeting bot, and it is not in this meeting.';
  }
  if (result.skipped === 'nobody-to-remind') {
    if (result.notConnected === 0) return 'Everyone has the pad open.';
    const who = result.notConnected === 1 ? '1 student does' : `${result.notConnected} students do`;
    return `${who} not have the pad open, but Teams has not shown the bot who they are yet.`;
  }
  const reached = result.sent + result.partial;
  if (reached === 0) return 'The reminder could not be sent. Try again in a moment.';
  return `Reminder sent to ${reached} ${reached === 1 ? 'student' : 'students'}.`;
}

/**
 * The key a question would be graded with: the teacher's, or else the question
 * bank's answer (Present to class), which Reveal uses when no key was chosen.
 * Null for a poll or a question with neither.
 */
export function effectiveKeys(
  prompt: Pick<TeacherPrompt, 'correct_keys' | 'ungraded'> & { suggested_keys?: string[] | null },
): string[] | null {
  if (prompt.ungraded) return null;
  if (prompt.correct_keys?.length) return prompt.correct_keys;
  return prompt.suggested_keys?.length ? prompt.suggested_keys : null;
}

export function mcqLetters(optionCount: number | null | undefined): string[] {
  const count = Math.min(Math.max(Math.trunc(optionCount ?? 4) || 4, 2), 6);
  return 'ABCDEF'.slice(0, count).split('');
}

export interface KeyChoice {
  value: string;
  count: number;
  selected: boolean;
}

/**
 * What the teacher can mark correct: every letter of a multiple choice question,
 * Yes and No, or for numbers and text the distinct answers students actually gave
 * (plus any key already chosen that nobody gave).
 */
export function keyChoices(
  prompt: Pick<TeacherPrompt, 'answer_type' | 'option_count' | 'correct_keys'>,
  groups: ReadonlyArray<{ value: string; count: number }>,
): KeyChoice[] {
  const counts = new Map(groups.map((group) => [group.value, group.count]));
  const selected = new Set(prompt.correct_keys ?? []);

  let values: string[];
  if (prompt.answer_type === 'mcq') values = mcqLetters(prompt.option_count);
  else if (prompt.answer_type === 'yesno') values = ['yes', 'no'];
  else values = [...new Set([...groups.map((group) => group.value), ...selected])];

  return values.map((value) => ({ value, count: counts.get(value) ?? 0, selected: selected.has(value) }));
}

/**
 * The key set after a tap, sorted as the database stores it. Null when the tap
 * would leave no key at all: a prompt either has a key or is a poll, so the
 * last key can only be replaced, never removed.
 */
export function toggleKey(current: readonly string[] | null | undefined, value: string): string[] | null {
  const keys = new Set(current ?? []);
  if (keys.has(value)) {
    if (keys.size === 1) return null;
    keys.delete(value);
  } else {
    keys.add(value);
  }
  return [...keys].sort();
}

export interface SummaryItem {
  key: 'correct' | 'incorrect' | 'answered' | 'silent' | 'excused' | 'absent';
  label: string;
  count: number;
}

/** The four groups after REVEAL, or three for a poll, which has no right or wrong. */
export function revealSummary(counts: PromptCounts | null, ungraded: boolean): SummaryItem[] {
  if (!counts) return [];
  const presence: SummaryItem[] = [
    { key: 'silent', label: 'No answer', count: counts.silent },
    ...(counts.excused ? [{ key: 'excused' as const, label: 'Excused', count: counts.excused }] : []),
    { key: 'absent', label: 'Not in the pad', count: counts.absent },
  ];
  if (ungraded) return [{ key: 'answered', label: 'Answered', count: counts.answered }, ...presence];
  return [
    { key: 'correct', label: 'Correct', count: counts.correct },
    { key: 'incorrect', label: 'Incorrect', count: counts.incorrect },
    ...presence,
  ];
}

export type ParticipationGroups = Record<SummaryItem['key'], ParticipationRow[]>;

/** "Round 2", or "Answer Pad" before a round has a number. */
export function roundTitle(roundNo: number | null | undefined): string {
  return roundNo ? `Round ${roundNo}` : 'Answer Pad';
}

export interface WaitingView {
  /** Reasons waiting for the teacher's decision, first; then turned-down reasons; then no word at all. */
  waiting: WaitingStudent[];
  /** Reasons the teacher accepted: out of this question's count. */
  excused: WaitingStudent[];
  /** Students the Nudge button would reach: no answer and no reason. */
  nudgeable: number;
  /** Reasons with no decision yet. */
  undecided: number;
}

function byStudentName(a: { name: string | null; student_id: string }, b: { name: string | null; student_id: string }): number {
  return (a.name ?? '').localeCompare(b.name ?? '') || a.student_id.localeCompare(b.student_id);
}

/** The Waiting list, in the order a teacher acts on it. */
export function waitingView(rows: readonly WaitingStudent[] | undefined): WaitingView {
  const list = rows ?? [];
  const undecided = list.filter((row) => row.reason && row.approval === null).sort(byStudentName);
  const rejected = list.filter((row) => row.reason && row.approval === 'rejected').sort(byStudentName);
  const silent = list.filter((row) => !row.reason).sort(byStudentName);
  return {
    waiting: [...undecided, ...rejected, ...silent],
    excused: list.filter((row) => row.reason && row.approval === 'approved').sort(byStudentName),
    nudgeable: silent.length,
    undecided: undecided.length,
  };
}

export interface AnswerNames {
  value: string;
  count: number;
  names: ParticipationRow[];
}

/**
 * Who picked each answer, for the bars: every letter (or Yes and No) in order,
 * or for numbers and text the answers given, most given first.
 */
export function namesByAnswer(
  prompt: Pick<TeacherPrompt, 'answer_type' | 'option_count'>,
  rows: readonly ParticipationRow[],
): AnswerNames[] {
  const byValue = new Map<string, ParticipationRow[]>();
  for (const row of rows) {
    if (row.participation !== 'answered' || row.answer === null) continue;
    const list = byValue.get(row.answer) ?? [];
    list.push(row);
    byValue.set(row.answer, list);
  }
  for (const list of byValue.values()) list.sort(byStudentName);

  const values =
    prompt.answer_type === 'mcq'
      ? mcqLetters(prompt.option_count)
      : prompt.answer_type === 'yesno'
        ? ['yes', 'no']
        : [...byValue.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([value]) => value);
  return values.map((value) => ({ value, count: byValue.get(value)?.length ?? 0, names: byValue.get(value) ?? [] }));
}

/** Present for the question but no answer, and excused, for the rows under the bars. */
export function unansweredNames(rows: readonly ParticipationRow[]): { silent: ParticipationRow[]; excused: ParticipationRow[] } {
  const sorted = [...rows].sort(byStudentName);
  return {
    silent: sorted.filter((row) => row.participation === 'silent'),
    excused: sorted.filter((row) => row.participation === 'excused'),
  };
}

/** "Asha, Ravi and 3 more", for a tooltip that has to stay short. */
export function namesPreview(rows: ReadonlyArray<{ name: string | null }>, max = 12): string {
  const names = rows.map((row) => row.name ?? 'Unnamed student');
  if (names.length === 0) return 'Nobody';
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** The named details, sorted into the same groups as the summary. */
export function groupParticipation(rows: readonly ParticipationRow[], ungraded: boolean): ParticipationGroups {
  const groups: ParticipationGroups = { correct: [], incorrect: [], answered: [], silent: [], excused: [], absent: [] };
  for (const row of rows) {
    if (row.participation !== 'answered') groups[row.participation].push(row);
    else if (ungraded || row.result === 'ungraded' || row.result === null) groups.answered.push(row);
    else if (row.result === 'correct') groups.correct.push(row);
    else groups.incorrect.push(row);
  }
  return groups;
}

/** Typed answers beyond this many bars fold under "N other answers". */
export const TOP_ANSWERS = 6;

/**
 * A letter or a short number sits beside its bar. Anything longer (a typed
 * sentence) goes on its own line above the bar, so a narrow side panel never
 * squeezes it into a column one word wide.
 */
export function stacksAnswerLabels(labels: readonly string[]): boolean {
  return labels.some((label) => label.length > 3);
}

/** The bars shown at first, and the rest. Multiple choice and yes or no never fold. */
export function foldAnswers<T>(answerType: AnswerType, rows: readonly T[], limit = TOP_ANSWERS): { shown: T[]; folded: T[] } {
  if (answerType === 'mcq' || answerType === 'yesno' || rows.length <= limit + 1) return { shown: [...rows], folded: [] };
  return { shown: rows.slice(0, limit), folded: rows.slice(limit) };
}

/** The class's name at the top of the console. */
export function consoleTitle(session: Pick<TeacherSnapshot['session'], 'title' | 'classroom_name'>): string {
  return session.title?.trim() || session.classroom_name?.trim() || 'Answer Pad';
}

export interface HereSummary {
  /** In the Teams meeting or opened the pad, this round. */
  here: number;
  /** Of them, who opened the pad. Null from a server that does not say. */
  opened: number | null;
  connected: number;
  enrolled: number;
  /** Whether the meeting's own list of who is in it is counting (the bot is in the meeting). */
  meetingList: boolean;
}

export function hereSummary(snapshot: Pick<TeacherSnapshot, 'readiness' | 'session'>): HereSummary {
  const { readiness, session } = snapshot;
  return {
    here: readiness.joined ?? readiness.connected,
    opened: readiness.opened ?? null,
    connected: readiness.connected,
    enrolled: readiness.enrolled,
    meetingList: session.bot_in_meeting || session.presence_basis === 'meeting',
  };
}

/** The header's caption: the round, then where it is. */
export function consoleStatus(roundNo: number | null | undefined, view: ConsoleView): string {
  const round = roundTitle(roundNo);
  switch (view.kind) {
    case 'open':
      return `${round} · ${promptTitle(view.prompt)} open`;
    case 'closed':
      return `${round} · ${promptTitle(view.prompt)} closed`;
    case 'revealed':
      return `${round} · ${promptTitle(view.prompt)} revealed`;
    case 'ended':
      return `${round} ended`;
    default:
      return round;
  }
}

// -----------------------------------------------------------------------------
// The class at a glance: the strip under the title and the People sheet
// -----------------------------------------------------------------------------

/**
 * Where each student on the class list is, right now.
 *
 * answered: answered the question on screen. waiting: here with the pad, no
 * answer yet (or, with no question, simply "pad open"). no_pad: in the Teams
 * meeting but has not opened the pad. excused: the teacher marked "Can't use the
 * pad", or accepted the reason they gave. not_here: on the list, not here.
 * away: told us in advance they are away today.
 */
export type FunnelGroup = 'answered' | 'waiting' | 'no_pad' | 'excused' | 'not_here' | 'away';

export const FUNNEL_GROUPS: readonly FunnelGroup[] = ['answered', 'waiting', 'no_pad', 'excused', 'not_here', 'away'];

export interface FunnelPerson {
  student_id: string;
  name: string | null;
  group: FunnelGroup;
  /** Waiting or excused: the reason on record, and the teacher's decision on it. */
  reason?: WaitingStudent['reason'];
  note?: string | null;
  approval?: WaitingStudent['approval'];
  /** Excused by the teacher's "Can't use the pad" mark (Undo removes the mark). */
  marked?: boolean;
  /** Away: "Away until 12 Oct". */
  awayLabel?: string;
}

export interface ClassFunnel {
  /** On the class list (never staff). */
  enrolled: number;
  /** On the class list, declared away today, and not here anyway. */
  away: number;
  /** The class list less the away: who the teacher can expect today. */
  expected: number;
  /** In the Teams meeting this round, or null when Teams is not sharing who is (no meeting list). */
  inMeeting: number | null;
  /** Opened the pad this round (not counting students marked "Can't use the pad"). */
  withPad: number;
  /** A question is on screen and not yet revealed: answered and waiting mean something. */
  asking: boolean;
  answered: number;
  groups: Record<FunnelGroup, FunnelPerson[]>;
  meetingList: boolean;
}

/**
 * One reading of the snapshot for the strip and the sheet, so the numbers on
 * the strip are always the lengths of the sheet's lists.
 */
export function classFunnel(snapshot: Pick<TeacherSnapshot, 'readiness' | 'session' | 'people' | 'waiting' | 'prompt'>): ClassFunnel {
  const meetingList = hereSummary(snapshot).meetingList;
  const people = snapshot.people;
  const groups: Record<FunnelGroup, FunnelPerson[]> = { answered: [], waiting: [], no_pad: [], excused: [], not_here: [], away: [] };
  const marked = new Set((people?.cant_use_pad ?? []).map((person) => person.student_id));
  const awayById = new Map((people?.away ?? []).map((person) => [person.student_id, person]));
  const waitingById = new Map((snapshot.waiting ?? []).map((row) => [row.student_id, row]));
  const asking = !!snapshot.prompt && snapshot.prompt.state !== 'revealed';

  // An older server sends who is waiting but no people lists: those are here, with the pad.
  const joined = people?.joined ?? (snapshot.waiting ?? []).map((row) => ({ student_id: row.student_id, name: row.name, source: 'pad' as const }));
  let inMeeting = 0;
  let withPad = 0;
  for (const person of joined) {
    const source = person.source ?? 'pad';
    if (source !== 'pad') inMeeting += 1;
    const base = { student_id: person.student_id, name: person.name };
    if (marked.has(person.student_id)) {
      groups.excused.push({ ...base, group: 'excused', marked: true });
      continue;
    }
    if (source !== 'meeting') withPad += 1;
    const waiting = waitingById.get(person.student_id);
    if (asking && waiting?.approval === 'approved') {
      groups.excused.push({ ...base, group: 'excused', reason: waiting.reason, note: waiting.note, approval: waiting.approval });
    } else if (asking && !waiting) {
      groups.answered.push({ ...base, group: 'answered' });
    } else if (source === 'meeting') {
      groups.no_pad.push({ ...base, group: 'no_pad', reason: waiting?.reason ?? null, note: waiting?.note ?? null, approval: waiting?.approval ?? null });
    } else {
      groups.waiting.push({ ...base, group: 'waiting', reason: waiting?.reason ?? null, note: waiting?.note ?? null, approval: waiting?.approval ?? null });
    }
  }
  for (const person of people?.not_joined ?? []) {
    const base = { student_id: person.student_id, name: person.name };
    const away = awayById.get(person.student_id);
    if (marked.has(person.student_id)) groups.excused.push({ ...base, group: 'excused', marked: true });
    else if (away) groups.away.push({ ...base, group: 'away', awayLabel: away.label });
    else groups.not_here.push({ ...base, group: 'not_here' });
  }

  // Reasons waiting for a decision first, as the Waiting list always ordered them; then by name.
  const order = (a: FunnelPerson, b: FunnelPerson) =>
    Number(!!b.reason && !b.approval) - Number(!!a.reason && !a.approval) || byStudentName(a, b);
  for (const group of FUNNEL_GROUPS) groups[group].sort(order);

  const enrolled = snapshot.readiness.enrolled;
  return {
    enrolled,
    away: groups.away.length,
    expected: Math.max(0, enrolled - groups.away.length),
    inMeeting: meetingList ? inMeeting : null,
    withPad,
    asking,
    answered: groups.answered.length,
    groups,
    meetingList,
  };
}

/** The strip's words, one item per number so a narrow panel wraps between them, never inside one. */
export function funnelItems(funnel: ClassFunnel): string[] {
  const items: string[] = [];
  if (!funnel.asking) items.push(`${funnel.enrolled} in class`);
  items.push(`${funnel.expected} expected`);
  items.push(funnel.inMeeting === null ? 'meeting ?' : `${funnel.inMeeting} in meeting`);
  items.push(`${funnel.withPad} with pad`);
  if (funnel.asking) items.push(`${funnel.answered} answered`);
  return items;
}

/**
 * The strip's four numbers, left to right as the class narrows: the class (or,
 * with a question on screen, who is expected), the meeting, the pad, answered.
 * `part` names the bar segment each number matches, for its colour dot.
 */
export function funnelStats(funnel: ClassFunnel): Array<{ value: string; label: string; part: 'answered' | 'waiting' | 'no_pad' | null }> {
  const stats: Array<{ value: string; label: string; part: 'answered' | 'waiting' | 'no_pad' | null }> = [];
  if (!funnel.asking) stats.push({ value: String(funnel.enrolled), label: 'in class', part: null });
  stats.push({ value: String(funnel.expected), label: 'expected', part: null });
  stats.push({ value: funnel.inMeeting === null ? '?' : String(funnel.inMeeting), label: 'in meeting', part: 'no_pad' });
  stats.push({ value: String(funnel.withPad), label: 'with pad', part: 'waiting' });
  if (funnel.asking) stats.push({ value: String(funnel.answered), label: 'answered', part: 'answered' });
  return stats;
}

/** The People sheet's chip for each group, worded for the moment (no question: "Pad open"). */
export function funnelGroupLabel(group: FunnelGroup, asking: boolean): string {
  switch (group) {
    case 'answered':
      return 'Answered';
    case 'waiting':
      return asking ? 'Not answered' : 'Pad open';
    case 'no_pad':
      return 'No pad';
    case 'excused':
      return 'Excused';
    case 'not_here':
      return 'Not here';
    case 'away':
      return 'Away';
  }
}

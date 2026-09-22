/**
 * What the teacher console shows, and the small rules behind its controls.
 * Pure, so the console's states and the key selector are unit tested.
 */

import { promptTitle } from './format';
import type { HistoryEntry, ParticipationRow, PromptCounts, TeacherPrompt, TeacherSnapshot } from './types';

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
    return {
      kind: 'open',
      prompt,
      // The live counter counts the class list only; anyone else is shown apart.
      answered: snapshot.counts?.answered ?? prompt.answered_count,
      enrolled: snapshot.counts?.enrolled ?? snapshot.readiness.enrolled,
      offRoster: snapshot.counts?.answered_off_roster ?? 0,
    };
  }
  if (prompt.state === 'closed') {
    return { kind: 'closed', prompt, decided: prompt.ungraded || (prompt.correct_keys?.length ?? 0) > 0 };
  }
  return { kind: 'revealed', prompt };
}

/** What a screen reader says when the console changes state. The live counter is not announced. */
export function consoleAnnouncement(view: ConsoleView): string {
  switch (view.kind) {
    case 'loading':
      return 'Loading the console.';
    case 'ended':
      return 'Class ended.';
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
  key: 'correct' | 'incorrect' | 'answered' | 'silent' | 'absent';
  label: string;
  count: number;
}

/** The four groups after REVEAL, or three for a poll, which has no right or wrong. */
export function revealSummary(counts: PromptCounts | null, ungraded: boolean): SummaryItem[] {
  if (!counts) return [];
  const presence: SummaryItem[] = [
    { key: 'silent', label: 'Present but silent', count: counts.silent },
    { key: 'absent', label: 'Absent', count: counts.absent },
  ];
  if (ungraded) return [{ key: 'answered', label: 'Answered', count: counts.answered }, ...presence];
  return [
    { key: 'correct', label: 'Correct', count: counts.correct },
    { key: 'incorrect', label: 'Incorrect', count: counts.incorrect },
    ...presence,
  ];
}

export type ParticipationGroups = Record<SummaryItem['key'], ParticipationRow[]>;

/** The named details, sorted into the same groups as the summary. */
export function groupParticipation(rows: readonly ParticipationRow[], ungraded: boolean): ParticipationGroups {
  const groups: ParticipationGroups = { correct: [], incorrect: [], answered: [], silent: [], absent: [] };
  for (const row of rows) {
    if (row.participation !== 'answered') groups[row.participation].push(row);
    else if (ungraded || row.result === 'ungraded' || row.result === null) groups.answered.push(row);
    else if (row.result === 'correct') groups.correct.push(row);
    else groups.incorrect.push(row);
  }
  return groups;
}

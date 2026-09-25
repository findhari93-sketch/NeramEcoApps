/**
 * The shape of a homework reminder, shared by the teacher's Remind button
 * (api/timetable/[classId]/homework-reminders) and the evening cron
 * (api/cron/homework-reminders). Server only.
 *
 * This file builds the messages and logs them; it never sends. Each caller
 * calls sendNudge itself with its own sender: the button with the teacher (the
 * Assistant's card says who it is from), the cron as Neram Assistant alone,
 * because a job that runs itself never puts a person's name on what it sends
 * (sender-classification.test.ts).
 */

import { recordAssignmentReminder } from '@neram/database';
import { plainToHtmlWithLink, type NudgeCounts, type NudgeResult, type SendNudgeInput } from './nudge-delivery';
import { classShareLinks, shareBaseUrl } from './class-share-links';
import type { ClassAssignment } from './class-work';
import { homeworkPhrase, homeworkReminderText } from './homework-reminders';

export type HomeworkBatch = Omit<SendNudgeInput, 'teacher' | 'sendAs' | 'chat' | 'from'> & {
  assistant: NonNullable<SendNudgeInput['assistant']>;
};

/**
 * One batch per distinct first-owed assignment, so every student's button opens
 * the piece they still owe. `{homework}` is filled per student with only what
 * that student has not handed in.
 */
export function homeworkBatches(input: {
  origin: string;
  classId: string;
  classTitle: string;
  dateLabel: string;
  owedBy: Map<string, ClassAssignment[]>;
  kind: 'first' | 'repeat';
  customBody?: string | null;
}): HomeworkBatch[] {
  const links = classShareLinks(shareBaseUrl(input.origin));
  const text = homeworkReminderText({ classTitle: input.classTitle, dateLabel: input.dateLabel, kind: input.kind });
  const body = input.customBody || text.body;

  const groups = new Map<string, string[]>();
  for (const [studentId, owed] of input.owedBy) {
    if (!owed.length) continue;
    const key = owed[0].id;
    groups.set(key, [...(groups.get(key) || []), studentId]);
  }

  return [...groups].map(([assignmentId, studentIds]) => {
    const url = links.assignment(assignmentId);
    const personalise: Record<string, Record<string, string>> = {};
    for (const id of studentIds) {
      personalise[id] = { homework: homeworkPhrase((input.owedBy.get(id) || []).map((a) => a.title)) };
    }
    return {
      studentIds,
      subject: text.subject,
      plain: `${body}\n\nHand it in here: ${url}`,
      html: plainToHtmlWithLink(body, url, 'Open the homework'),
      teamsText: text.subject,
      eventType: 'assignment_nudge',
      personalise,
      metadata: {
        source: input.kind === 'first' ? 'homework_reminder' : 'homework_reminder_auto',
        scheduled_class_id: input.classId,
        assignment_ids: [assignmentId],
        url,
      },
      assistant: { link: { url, label: 'Open the homework' } },
      source: { kind: 'homework_reminder', refId: input.classId },
    };
  });
}

/** Adds one batch's counts into a running total. */
export function addCounts(total: NudgeCounts, next: NudgeCounts): NudgeCounts {
  return {
    total: total.total + next.total,
    chat: total.chat + next.chat,
    teams: total.teams + next.teams,
    inapp: total.inapp + next.inapp,
    failed: total.failed + next.failed,
    skipped: (total.skipped ?? 0) + (next.skipped ?? 0),
    unreached: (total.unreached ?? 0) + (next.unreached ?? 0),
  };
}

export const EMPTY_COUNTS: NudgeCounts = { total: 0, chat: 0, teams: 0, inapp: 0, failed: 0, skipped: 0, unreached: 0 };

/**
 * One nexus_assignment_reminders row per student per owed assignment: the
 * assignment page's "reminded N times", whoever or whatever sent it.
 */
export async function logHomeworkReminders(input: {
  results: NudgeResult[];
  owedBy: Map<string, ClassAssignment[]>;
  sentBy: string | null;
  kind: 'first' | 'repeat';
}): Promise<void> {
  await Promise.all(
    input.results.flatMap((r) =>
      (input.owedBy.get(r.studentId) || []).map((a) =>
        recordAssignmentReminder({
          assignment_id: a.id,
          student_id: r.studentId,
          sent_by: input.sentBy,
          channel: r.channel,
          template: input.kind === 'first' ? 'homework_came' : 'homework_auto',
        }),
      ),
    ),
  );
}

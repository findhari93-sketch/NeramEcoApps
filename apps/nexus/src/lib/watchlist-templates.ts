/**
 * The inactivity escalation ladder: its states, the legal moves between them,
 * and the message each rung sends.
 *
 * PURE TypeScript (no JSX, no Supabase) so the rules are unit-testable and the
 * API route and the UI cannot drift apart on what "the next step" is.
 *
 * The ladder exists so nobody is removed from a classroom on a whim. The system
 * ranks and prepares; a human takes every step, in order, on the record.
 *
 *   none -> nudged -> warned -> parent_contacted -> final_notice -> removed
 *
 * Off-ramps at any point: `resolved` (the student came back) and a snooze date
 * (hide the row for a while without changing the stage, e.g. the student is
 * unwell or sitting an exam).
 */

export type WatchlistStage =
  | 'none'
  | 'nudged'
  | 'warned'
  | 'parent_contacted'
  | 'final_notice'
  | 'removed'
  | 'resolved';

export type WatchlistAction =
  | 'nudge'
  | 'warn'
  | 'parent_contacted'
  | 'final_notice'
  | 'resolve'
  | 'snooze'
  | 'note'
  | 'removed';

/** The append-only event kind written for each action. */
export const ACTION_EVENT: Record<WatchlistAction, string> = {
  nudge: 'nudge_sent',
  warn: 'warning_sent',
  parent_contacted: 'parent_contacted',
  final_notice: 'final_notice_sent',
  resolve: 'resolved',
  snooze: 'snoozed',
  note: 'note',
  removed: 'removed',
};

/** Stage an action moves the student to. `note` and `snooze` do not move them. */
export const ACTION_STAGE: Record<WatchlistAction, WatchlistStage | null> = {
  nudge: 'nudged',
  warn: 'warned',
  parent_contacted: 'parent_contacted',
  final_notice: 'final_notice',
  resolve: 'resolved',
  removed: 'removed',
  snooze: null,
  note: null,
};

export const STAGE_LABEL: Record<WatchlistStage, string> = {
  none: 'Not started',
  nudged: 'Nudged',
  warned: 'Warned',
  parent_contacted: 'Parent contacted',
  final_notice: 'Final notice',
  removed: 'Removed',
  resolved: 'Back on track',
};

/** Rungs in order. `none` is the floor; the off-ramps are not rungs. */
const LADDER: WatchlistStage[] = [
  'none',
  'nudged',
  'warned',
  'parent_contacted',
  'final_notice',
  'removed',
];

/**
 * The single escalating action offered from a given stage. Returns null at the
 * top (already removed) and from `resolved`, where the right move is to let the
 * student be until the score says otherwise.
 */
export function nextAction(stage: WatchlistStage): WatchlistAction | null {
  const order: Record<string, WatchlistAction> = {
    none: 'nudge',
    nudged: 'warn',
    warned: 'parent_contacted',
    parent_contacted: 'final_notice',
    final_notice: 'removed',
  };
  return order[stage] ?? null;
}

/**
 * Is this move legal from the current stage? Teachers may only take the next
 * rung (plus the off-ramps), so nobody goes from "flagged" to "removed" in one
 * tap. Admins bypass this, hence the `isAdmin` escape.
 */
export function canTakeAction(
  stage: WatchlistStage,
  action: WatchlistAction,
  isAdmin = false,
): boolean {
  if (action === 'resolve' || action === 'snooze' || action === 'note') return true;
  if (isAdmin) return true;
  return nextAction(stage) === action;
}

/** Has the student been through the whole ladder, so removal is on the table? */
export function canRemove(stage: WatchlistStage, isAdmin = false): boolean {
  return isAdmin || stage === 'final_notice';
}

/** Position on the ladder, for progress display. -1 for the off-ramps. */
export function ladderIndex(stage: WatchlistStage): number {
  return LADDER.indexOf(stage);
}

export const LADDER_LENGTH = LADDER.length;

export interface TemplateInput {
  /** The student's first name, or a neutral fallback. */
  name: string;
  /** Reason chips from scoreInactivity, e.g. ['Never opened Nexus']. */
  reasons: string[];
}

export interface NudgeTemplate {
  subject: string;
  body: string;
}

function firstName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

/** "no assignment ever submitted and never opened Nexus" */
function reasonSentence(reasons: string[]): string {
  const lower = reasons.map((r) => r.toLowerCase());
  if (lower.length === 0) return 'we have not seen you in class recently';
  if (lower.length === 1) return lower[0];
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/**
 * The message for each message-sending rung. Tone escalates; the facts stay the
 * same and are always stated, so a student is never told off without being told
 * why.
 */
export function buildTemplate(action: WatchlistAction, input: TemplateInput): NudgeTemplate {
  const name = firstName(input.name);
  const why = reasonSentence(input.reasons);

  switch (action) {
    case 'nudge':
      return {
        subject: 'We have missed you in class',
        body:
          `Hi ${name}, we noticed ${why}.\n\n` +
          `Is everything alright? Open Nexus and catch up when you can, and tell your teacher ` +
          `if something is getting in the way. We would rather help than chase.`,
      };

    case 'warn':
      return {
        subject: 'Please get back into class',
        body:
          `Hi ${name}, we reached out earlier and still see ${why}.\n\n` +
          `Please open Nexus this week, submit your pending work, and join the next class. ` +
          `If you are stuck or something has changed, reply to your teacher on Teams today.`,
      };

    case 'final_notice':
      return {
        subject: 'Final notice about your place in the class',
        body:
          `Hi ${name}, this is a final notice. We have contacted you and your parent, and we ` +
          `still see ${why}.\n\n` +
          `Please open Nexus and speak to your teacher within the next few days. If we do not ` +
          `hear from you, your place in this classroom will be given up and you will lose ` +
          `access to Nexus. We do not want that, so please get in touch.`,
      };

    default:
      // parent_contacted, resolve, snooze, note and removed do not send a
      // student message: parent contact is a phone call a teacher makes, and
      // the rest are bookkeeping.
      return {
        subject: 'About your class',
        body: `Hi ${name}, your teacher has made a note about your class attendance.`,
      };
  }
}

/** Does this action send a message to the student? */
export function sendsMessage(action: WatchlistAction): boolean {
  return action === 'nudge' || action === 'warn' || action === 'final_notice';
}

/**
 * Pre-filled removal note, so the reason recorded on the enrollment is the
 * actual evidence rather than a bare "inactive".
 */
export function removalNote(tier: string, reasons: string[]): string {
  const detail = reasons.length ? reasons.join(', ').toLowerCase() : 'no activity recorded';
  return `Removed after repeated inactivity (${tier}): ${detail}. Nudge, warning, parent contact and final notice were all sent first.`;
}

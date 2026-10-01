/**
 * Ready-made notes for the ticket steps that need words from staff.
 *
 * Picking an outcome fills the note, so the common case ("Fixed", "try it once
 * more") is one tap instead of the same sentence typed on every ticket. The
 * teacher's own last note for that outcome wins over the built-in one: most
 * people settle on a phrasing and want it back, not ours.
 *
 * Pure except for the two storage helpers, which are per-device conveniences
 * and fail quietly (private window, blocked storage).
 */

import type { FoundationIssueResolutionCode } from '@neram/database/types';

export type TemplateMode = 'resolve' | 'close';
type StaffCode = Exclude<FoundationIssueResolutionCode, 'no_response'>;

/**
 * The note is quoted inside the student's message, which already says who
 * resolved it and asks them to confirm, so these read as the teacher's own words.
 */
export const REPLY_TEMPLATES: Record<TemplateMode, Record<StaffCode, string[]>> = {
  resolve: {
    fixed: [
      'I have fixed this. Please try it once more and tell me on the ticket whether it works now.',
      'This is fixed. Please refresh the page (or close and reopen Nexus), try again, and let me know.',
    ],
    answered: [
      'I have answered your question in the conversation. Please tell me if anything is still unclear.',
    ],
    not_a_bug: [
      'This is working as it is meant to. I have explained how it works in the conversation. Tell me if it still does not look right.',
    ],
    duplicate: [
      'This is the same problem as another ticket that we are already fixing. We will keep you posted there.',
    ],
    wont_fix: [
      'We are not changing this for now. Thank you for telling us, it helps us plan what to improve next.',
    ],
  },
  close: {
    fixed: [
      'This is fixed and we checked it with you, so I am closing the ticket.',
    ],
    answered: [
      'Your question is answered, so I am closing the ticket. Reopen it if anything is still unclear.',
    ],
    not_a_bug: [
      'This is working as it is meant to, so I am closing the ticket. Reopen it if it still looks wrong.',
    ],
    duplicate: [
      'This is the same problem as another ticket, so I am closing this one. We will follow up on the other.',
    ],
    wont_fix: [
      'We are not changing this for now, so I am closing the ticket. Thank you for telling us.',
    ],
  },
};

export function templatesFor(mode: TemplateMode, code: FoundationIssueResolutionCode | null): string[] {
  if (!code || code === 'no_response') return [];
  return REPLY_TEMPLATES[mode][code] ?? [];
}

const STORAGE_PREFIX = 'nexus.issue-note';
const storageKey = (mode: TemplateMode, code: string) => `${STORAGE_PREFIX}.${mode}.${code}`;

/** This teacher's last note for the outcome on this device, if any. */
export function readLastNote(mode: TemplateMode, code: FoundationIssueResolutionCode | null): string | null {
  if (!code) return null;
  try {
    const value = window.localStorage.getItem(storageKey(mode, code));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function saveLastNote(mode: TemplateMode, code: FoundationIssueResolutionCode | null, note: string): void {
  if (!code || !note.trim()) return;
  try {
    window.localStorage.setItem(storageKey(mode, code), note.trim());
  } catch {
    /* storage blocked: the built-in template still works */
  }
}

/**
 * What fills the note when an outcome is picked: the teacher's own last note,
 * else the first built-in one.
 */
export function defaultNote(mode: TemplateMode, code: FoundationIssueResolutionCode | null, lastNote: string | null): string {
  return lastNote || templatesFor(mode, code)[0] || '';
}

/**
 * The quick-reply chips: the teacher's last note first (when it is not already
 * one of ours), then the built-ins. Never a duplicate.
 */
export function quickReplies(mode: TemplateMode, code: FoundationIssueResolutionCode | null, lastNote: string | null): { text: string; mine: boolean }[] {
  const builtIns = templatesFor(mode, code);
  const list = builtIns.map((text) => ({ text, mine: false }));
  if (lastNote && !builtIns.includes(lastNote)) list.unshift({ text: lastNote, mine: true });
  return list;
}

/**
 * Whether picking a new outcome may replace the note. Only when the teacher has
 * not written anything of their own: the box is empty, or still holds exactly
 * what we filled in last time.
 */
export function mayReplaceNote(current: string, lastAutoFill: string): boolean {
  return current.trim() === '' || current === lastAutoFill;
}

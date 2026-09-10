/**
 * Which notifications an open bell has actually put in front of someone.
 *
 * The bell used to mark nothing read on open. A row cleared only if you tapped
 * it, or hit "Mark all as read". That is fine for a row you act on, and useless
 * for a purely informational one ("Issue Confirmed Resolved"), which there is no
 * reason to ever tap. So the badge went on advertising news the person had
 * plainly already read, and no amount of looking at it cleared it.
 *
 * Pure and separate from the component so the rule is testable without mounting
 * MUI, the same reason photo-roster.ts exists.
 *
 * `is_read` on user_notifications means "seen in the inbox" and nothing else:
 * every writer sets it false on insert and nothing anywhere re-notifies based on
 * it, so sweeping it suppresses no reminder. Outstanding WORK has its own
 * signals, the nav badges.
 */

/**
 * Long enough to be a look rather than a mis-tap, short enough that it feels
 * automatic. Not on open (a stray tap would wipe the badge) and not on close
 * (clicking a row closes the panel and navigates, so the unmount would race the
 * writes).
 */
export const SEEN_DWELL_MS = 1200;

export interface SeenCandidate {
  id: string;
  is_read: boolean;
}

/**
 * The unread rows this panel is showing that have not been swept already.
 *
 * `alreadyMarked` is what stops a re-open firing duplicate POSTs: marking a row
 * read flips `is_read` in the caller's array optimistically, but a fresh fetch
 * can hand back the old value before the server catches up.
 *
 * The panel holds only the newest page while the badge counts every unread row,
 * so someone with 40 unread correctly clears the 15 they were shown and keeps a
 * badge of 25. That is the honest number either way.
 */
export function pickSeenNotifications(
  notifications: readonly SeenCandidate[],
  alreadyMarked: ReadonlySet<string>,
): string[] {
  return notifications
    .filter((n) => !n.is_read && !alreadyMarked.has(n.id))
    .map((n) => n.id);
}

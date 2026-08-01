/**
 * Everything the class panel derives from one class row, in one pure place.
 *
 * This lived inline in ClassDetailPanel and, in a thinner form, in
 * ClassEditPanel, which is how the two surfaces came to disagree about whether
 * a class had ended: the drawer rebuilt the IST boundary by hand while the rail
 * called hasClassEnded. Both now answer from here, and the answer is unit
 * tested, which the inline copies never were.
 *
 * No React, no MUI. Everything below is a plain function of a class row.
 */

import { hasClassEnded, classStartDate } from '../date-utils';
import type { ClassCardData } from '../ClassCard';

export type ClassPanelRole = 'teacher' | 'student';

/** Overlay sheet/drawer, or the planner's permanent right column. */
export type ClassPanelVariant = 'drawer' | 'docked';

/**
 * Class = what this class is and how to get into it.
 * Prep  = what it hands the student, and what they owe before it.
 * After = what it left behind once it ran.
 */
export type ClassPanelTabKey = 'class' | 'prep' | 'after';

export interface ClassState {
  /** Finished by the clock, whatever the stored status says. */
  hasEnded: boolean;
  isLive: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  /** Historical: finished or explicitly completed, and never cancelled. */
  isPast: boolean;
  /** Still to come or running, and neither historical nor cancelled. */
  isUpcoming: boolean;
  /** What the status chip should say. A past class reads "completed". */
  displayStatus: string;
  meetingUrl: string | null;
  hasMeeting: boolean;
  /** The prep gate is shut for this viewer. */
  prepShut: boolean;
  hasRecording: boolean;
  hasCalendarEntry: boolean;
  onTutorCalendar: boolean;
  isRealChannelMeeting: boolean;
  needsCalendarRepair: boolean;
  isDraft: boolean;
  /** Editing details is off the table once a class has run. */
  canEditDetails: boolean;
}

export interface TimeIndicator {
  label: string;
  color: 'error' | 'warning' | 'primary';
}

/** The prep-gate summary shape the student class routes return. */
interface PrepLike {
  gated?: boolean;
  open?: boolean;
}

export function deriveClassState(
  cls: ClassCardData,
  role: ClassPanelRole,
  prep?: PrepLike | null,
  now: Date = new Date(),
): ClassState {
  // A class whose end time has passed is historical, even if its status was
  // never flipped to 'completed' (that transition depends on a Teams sync that
  // can lag or never run). Time is the honest signal for "this already
  // happened", and hasClassEnded builds the boundary in IST explicitly so a
  // 9 PM class does not read as ended to a browser in another timezone.
  const hasEnded = hasClassEnded(cls, now);
  const isLive = cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
  const isPast = !isCancelled && (isCompleted || hasEnded);
  const isUpcoming = !isCancelled && !isPast;

  const meetingUrl = cls.teams_meeting_join_url || cls.teams_meeting_url || null;

  // Whether the class actually reached anybody's calendar. Derived from the
  // event id, never from teams_meeting_scope: the scope is written on the
  // failure path too, so a class could claim "Calendar invites" having invited
  // nobody.
  const hasCalendarEntry = !!cls.teams_calendar_event_id;

  // Whether it reached the TUTOR'S OWN calendar, which is a different question.
  // A channel meeting's event lives on the M365 group's calendar, and a group
  // calendar is nobody's personal calendar: neither Outlook nor Teams desktop
  // shows it in the personal view, and the organizer is not on the invite list
  // because they are the organizer. So a class can have invited every student
  // and still be missing from the calendar of the person teaching it.
  const onTutorCalendar = !!cls.teams_organizer_event_id;

  // Whether this is genuinely a Teams CHANNEL meeting, read off the join URL's
  // thread type rather than teams_meeting_scope. Those are different questions:
  // the scope column records where the calendar event lives, and asking for a
  // channel meeting writes a group calendar event whose meeting is an ordinary
  // one, so the column labelled plain meetings "Channel Meeting".
  // `@thread.tacv2` is a channel thread, `@thread.v2` is a standalone meeting
  // thread. Falls back to the column for students, whose join URL the server
  // strips.
  const isRealChannelMeeting = meetingUrl
    ? meetingUrl.includes('thread.tacv2')
    : cls.teams_meeting_scope === 'channel_meeting';

  // Only offered for classes still ahead of us. Adding a calendar entry for a
  // class that already happened mails everyone about a meeting in the past.
  const needsCalendarRepair =
    role === 'teacher' && !!cls.teams_meeting_id && !onTutorCalendar && !isCancelled && isUpcoming;

  return {
    hasEnded,
    isLive,
    isCompleted,
    isCancelled,
    isPast,
    isUpcoming,
    displayStatus: isCancelled ? 'cancelled' : isPast ? 'completed' : cls.status,
    meetingUrl,
    hasMeeting: !!cls.teams_meeting_id,
    // The server has already nulled meetingUrl when the gate is shut, so this
    // only decides whether we can EXPLAIN the absence instead of showing a
    // class with no button and no reason why.
    prepShut: !!prep?.gated && !prep.open,
    hasRecording: !!cls.recording_url,
    hasCalendarEntry,
    onTutorCalendar,
    isRealChannelMeeting,
    needsCalendarRepair,
    isDraft: (cls as unknown as { publish_state?: string }).publish_state === 'draft',
    // Once a class is over, the wrap up is where its record is written, and
    // editing the class dialog would push a rename to a Teams meeting everyone
    // has already attended.
    canEditDetails: !hasEnded && !isCancelled,
  };
}

/** "Live Now", "Starts in 20 min", or nothing worth saying. */
export function getTimeIndicator(
  cls: ClassCardData,
  state: ClassState,
  now: Date = new Date(),
): TimeIndicator | null {
  // A class that is over has no time left to describe, and this guard is the
  // whole reason the function takes `state`. Nothing flips a finished class to
  // `completed` (that transition depends on a Teams sync that may never run), so
  // in production every past class is still `scheduled`. Without this line the
  // start time is in the past, the countdown goes negative, and a class that
  // finished last Friday sits under a "Done" chip announcing "Starting soon".
  if (state.isPast || state.isCancelled) return null;

  if (state.isLive) return { label: 'Live Now', color: 'error' };
  if (cls.status !== 'scheduled') return null;

  const diffMs = classStartDate(cls.scheduled_date, cls.start_time).getTime() - now.getTime();
  // Started, but not over: the stored status has not caught up with the clock.
  if (diffMs < 0) return { label: 'Starting soon', color: 'warning' };

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return { label: `Starts in ${diffMin} min`, color: 'warning' };

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return { label: `Starts in ${diffHrs}h`, color: 'primary' };
  return null;
}

interface TabContext {
  /** Assignments attached to this class, as the student page passes them. */
  assignments?: { id: string }[];
  prep?: PrepLike | null;
}

/**
 * Which tabs this class earns, in order.
 *
 * A tab that would open onto nothing is worse than no tab: it reads as a
 * feature that is broken rather than one that does not apply here. So "After"
 * waits until the class has actually run, and a student only gets "Prep" when
 * something was in fact asked of them.
 */
export function visibleTabs(
  state: ClassState,
  role: ClassPanelRole,
  ctx: TabContext = {},
): ClassPanelTabKey[] {
  const tabs: ClassPanelTabKey[] = ['class'];

  const hasStudentPrep = (ctx.assignments?.length ?? 0) > 0 || ctx.prep != null;
  if (role === 'teacher' ? !state.isCancelled : hasStudentPrep) tabs.push('prep');

  if (state.isPast) tabs.push('after');

  return tabs;
}

/**
 * Which tab to open on.
 *
 * The docked rail exists because a teacher is deliberately setting a week up,
 * so it opens on Prep. The overlay is opened by tapping a class to find out
 * about it, so it opens on Class, unless the class has already run, in which
 * case what a teacher wants is nearly always the register.
 */
export function defaultTab(
  state: ClassState,
  role: ClassPanelRole,
  variant: ClassPanelVariant,
  ctx: TabContext = {},
): ClassPanelTabKey {
  const tabs = visibleTabs(state, role, ctx);
  const prefer = (key: ClassPanelTabKey) => (tabs.includes(key) ? key : null);

  if (variant === 'docked' && !state.isPast) return prefer('prep') ?? 'class';
  if (state.isPast && role === 'teacher') return prefer('after') ?? 'class';
  return 'class';
}

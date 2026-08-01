import { describe, it, expect } from 'vitest';
import {
  deriveClassState,
  getTimeIndicator,
  visibleTabs,
  defaultTab,
  type ClassPanelRole,
} from './class-state';
import type { ClassCardData } from '../ClassCard';

/** A scheduled evening class, IST. Override whatever the case is about. */
function makeClass(over: Partial<ClassCardData> = {}): ClassCardData {
  return {
    id: 'c1',
    title: 'JEE Preparation B.Arch',
    scheduled_date: '2026-07-31',
    start_time: '19:00',
    end_time: '20:30',
    status: 'scheduled',
    teams_meeting_url: null,
    teams_meeting_join_url: null,
    teams_meeting_id: null,
    teams_meeting_scope: null,
    recording_url: null,
    batch_id: null,
    topic: null,
    teacher: { id: 't1', name: 'Hari Babu', avatar_url: null },
    batch: null,
    ...over,
  } as ClassCardData;
}

/** 7:45 PM IST on the class day: mid-class. */
const DURING = new Date('2026-07-31T14:15:00Z');
/** 10 PM IST on the class day: after it. */
const AFTER = new Date('2026-07-31T16:30:00Z');
/** 6:40 PM IST on the class day: 20 minutes before it. */
const BEFORE_20MIN = new Date('2026-07-31T13:10:00Z');

describe('deriveClassState', () => {
  it('treats a class whose end time has passed as past, even while its status says scheduled', () => {
    // The Teams sync that flips status to completed can lag or never run, so
    // the clock has to be the honest signal. This is the invariant the whole
    // "After" tab hangs off.
    const state = deriveClassState(makeClass({ status: 'scheduled' }), 'teacher', null, AFTER);
    expect(state.hasEnded).toBe(true);
    expect(state.isPast).toBe(true);
    expect(state.isUpcoming).toBe(false);
    expect(state.displayStatus).toBe('completed');
  });

  it('keeps a class mid-session upcoming, not past', () => {
    const state = deriveClassState(makeClass({ status: 'live' }), 'teacher', null, DURING);
    expect(state.hasEnded).toBe(false);
    expect(state.isPast).toBe(false);
    expect(state.isUpcoming).toBe(true);
    expect(state.isLive).toBe(true);
    expect(state.displayStatus).toBe('live');
  });

  it('builds the end boundary in IST, not the browser timezone', () => {
    // 8:20 PM IST is before a class ending at 8:30 PM. A naive UTC parse would
    // read 14:50Z as long past 20:30 and call the class over.
    const justBeforeEnd = new Date('2026-07-31T14:50:00Z');
    expect(deriveClassState(makeClass(), 'teacher', null, justBeforeEnd).hasEnded).toBe(false);
  });

  it('leaves a cancelled past class neither past nor upcoming', () => {
    const state = deriveClassState(makeClass({ status: 'cancelled' }), 'teacher', null, AFTER);
    expect(state.isCancelled).toBe(true);
    expect(state.isPast).toBe(false);
    expect(state.isUpcoming).toBe(false);
    expect(state.displayStatus).toBe('cancelled');
  });

  describe('needsCalendarRepair', () => {
    const withMeeting = { teams_meeting_id: 'm1' };

    it('is true for a teacher, upcoming, with a meeting and no organizer event', () => {
      const state = deriveClassState(makeClass(withMeeting), 'teacher', null, BEFORE_20MIN);
      expect(state.needsCalendarRepair).toBe(true);
    });

    it('is false once the organizer event exists', () => {
      const cls = makeClass({ ...withMeeting, teams_organizer_event_id: 'e1' });
      expect(deriveClassState(cls, 'teacher', null, BEFORE_20MIN).needsCalendarRepair).toBe(false);
    });

    it('is false for a past class, so history does not sprout repair buttons', () => {
      expect(deriveClassState(makeClass(withMeeting), 'teacher', null, AFTER).needsCalendarRepair).toBe(
        false,
      );
    });

    it('is false for a student', () => {
      expect(
        deriveClassState(makeClass(withMeeting), 'student', null, BEFORE_20MIN).needsCalendarRepair,
      ).toBe(false);
    });

    it('is false with no meeting at all', () => {
      expect(deriveClassState(makeClass(), 'teacher', null, BEFORE_20MIN).needsCalendarRepair).toBe(
        false,
      );
    });
  });

  describe('isRealChannelMeeting', () => {
    it('reads the thread type off the join URL', () => {
      const channel = makeClass({ teams_meeting_join_url: 'https://teams/l/19:abc@thread.tacv2/0' });
      expect(deriveClassState(channel, 'teacher', null, DURING).isRealChannelMeeting).toBe(true);

      const plain = makeClass({
        teams_meeting_join_url: 'https://teams/l/19:abc@thread.v2/0',
        // The column lies here: create writes channel_meeting for a plain meeting.
        teams_meeting_scope: 'channel_meeting',
      });
      expect(deriveClassState(plain, 'teacher', null, DURING).isRealChannelMeeting).toBe(false);
    });

    it('falls back to the scope column when the URL is stripped, as it is for students', () => {
      const cls = makeClass({ teams_meeting_scope: 'channel_meeting' });
      expect(deriveClassState(cls, 'student', null, DURING).isRealChannelMeeting).toBe(true);
    });
  });

  it('derives hasCalendarEntry from the event id, never from the scope column', () => {
    // The scope is written on the failure path too, so a class could otherwise
    // claim "Calendar invites" having invited nobody.
    const claimsButFailed = makeClass({ teams_meeting_scope: 'calendar_event' });
    expect(deriveClassState(claimsButFailed, 'teacher', null, DURING).hasCalendarEntry).toBe(false);

    const real = makeClass({ teams_calendar_event_id: 'e1' });
    expect(deriveClassState(real, 'teacher', null, DURING).hasCalendarEntry).toBe(true);
  });

  it('shuts the prep gate only when it is gated and not open', () => {
    const cls = makeClass();
    expect(deriveClassState(cls, 'student', { gated: true, open: false }, DURING).prepShut).toBe(true);
    expect(deriveClassState(cls, 'student', { gated: true, open: true }, DURING).prepShut).toBe(false);
    // Never gated is the common case and must behave as it did before the gate.
    expect(deriveClassState(cls, 'student', null, DURING).prepShut).toBe(false);
  });

  it('closes editing once the class has ended or been cancelled', () => {
    expect(deriveClassState(makeClass(), 'teacher', null, BEFORE_20MIN).canEditDetails).toBe(true);
    expect(deriveClassState(makeClass(), 'teacher', null, AFTER).canEditDetails).toBe(false);
    expect(
      deriveClassState(makeClass({ status: 'cancelled' }), 'teacher', null, BEFORE_20MIN)
        .canEditDetails,
    ).toBe(false);
  });
});

describe('getTimeIndicator', () => {
  const indicatorFor = (cls: ClassCardData, now: Date) =>
    getTimeIndicator(cls, deriveClassState(cls, 'teacher', null, now), now);

  it('says Live Now for a live class', () => {
    expect(indicatorFor(makeClass({ status: 'live' }), DURING)).toEqual({
      label: 'Live Now',
      color: 'error',
    });
  });

  it('counts down in minutes under an hour', () => {
    expect(indicatorFor(makeClass(), BEFORE_20MIN)).toEqual({
      label: 'Starts in 20 min',
      color: 'warning',
    });
  });

  it('counts down in hours under a day', () => {
    const fourHoursBefore = new Date('2026-07-31T09:30:00Z');
    expect(indicatorFor(makeClass(), fourHoursBefore)).toEqual({
      label: 'Starts in 4h',
      color: 'primary',
    });
  });

  it('says nothing more than a day out', () => {
    expect(indicatorFor(makeClass(), new Date('2026-07-25T09:30:00Z'))).toBeNull();
  });

  it('says nothing for a class that is not scheduled', () => {
    expect(indicatorFor(makeClass({ status: 'cancelled' }), BEFORE_20MIN)).toBeNull();
  });

  it('says nothing once the class is over, even though its status is still scheduled', () => {
    // The exact production row behind the bug: nothing ever flips a finished
    // class to completed, so the start time is in the past and the countdown
    // used to fall through to "Starting soon" next to the "Done" chip.
    expect(indicatorFor(makeClass({ status: 'scheduled' }), AFTER)).toBeNull();
  });

  it('still says Starting soon between the start and the end', () => {
    // The one case the guard must not swallow: the class has begun, the status
    // has not caught up, and it genuinely is about to start for anyone late.
    expect(indicatorFor(makeClass({ status: 'scheduled' }), DURING)).toEqual({
      label: 'Starting soon',
      color: 'warning',
    });
  });

  it('says nothing for a cancelled class that has already passed', () => {
    expect(indicatorFor(makeClass({ status: 'cancelled' }), AFTER)).toBeNull();
  });
});

describe('visibleTabs', () => {
  const tabsFor = (
    cls: ClassCardData,
    role: ClassPanelRole,
    now: Date,
    ctx?: Parameters<typeof visibleTabs>[2],
  ) => visibleTabs(deriveClassState(cls, role, ctx?.prep, now), role, ctx);

  it('gives a teacher After only once the class has run', () => {
    expect(tabsFor(makeClass(), 'teacher', BEFORE_20MIN)).toEqual(['class', 'prep']);
    expect(tabsFor(makeClass(), 'teacher', AFTER)).toEqual(['class', 'prep', 'after']);
  });

  it('drops Prep and After for a cancelled class', () => {
    expect(tabsFor(makeClass({ status: 'cancelled' }), 'teacher', AFTER)).toEqual(['class']);
  });

  it('gives a student Prep only when something was asked of them', () => {
    expect(tabsFor(makeClass(), 'student', BEFORE_20MIN)).toEqual(['class']);
    expect(tabsFor(makeClass(), 'student', BEFORE_20MIN, { assignments: [{ id: 'a1' }] })).toEqual([
      'class',
      'prep',
    ]);
    expect(tabsFor(makeClass(), 'student', BEFORE_20MIN, { prep: { gated: true, open: true } })).toEqual(
      ['class', 'prep'],
    );
  });

  it('gives a student After for a class that has run', () => {
    expect(tabsFor(makeClass(), 'student', AFTER)).toEqual(['class', 'after']);
  });
});

describe('defaultTab', () => {
  const pick = (
    cls: ClassCardData,
    role: ClassPanelRole,
    variant: 'drawer' | 'docked',
    now: Date,
    ctx?: Parameters<typeof defaultTab>[3],
  ) => defaultTab(deriveClassState(cls, role, ctx?.prep, now), role, variant, ctx);

  it('opens the docked rail on Prep for an upcoming class', () => {
    expect(pick(makeClass(), 'teacher', 'docked', BEFORE_20MIN)).toBe('prep');
  });

  it('opens the docked rail on After once the class has run', () => {
    expect(pick(makeClass(), 'teacher', 'docked', AFTER)).toBe('after');
  });

  it('opens the drawer on Class for an upcoming class', () => {
    expect(pick(makeClass(), 'teacher', 'drawer', BEFORE_20MIN)).toBe('class');
  });

  it('opens the drawer on After for a teacher looking at a past class', () => {
    expect(pick(makeClass(), 'teacher', 'drawer', AFTER)).toBe('after');
  });

  it('opens on Class for a student, past or not', () => {
    expect(pick(makeClass(), 'student', 'drawer', BEFORE_20MIN)).toBe('class');
    expect(pick(makeClass(), 'student', 'drawer', AFTER)).toBe('class');
  });

  it('falls back to Class when the preferred tab is not on offer', () => {
    // Cancelled: no Prep to dock onto.
    expect(pick(makeClass({ status: 'cancelled' }), 'teacher', 'docked', BEFORE_20MIN)).toBe('class');
  });
});

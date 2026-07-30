import { describe, it, expect } from 'vitest';
import {
  FEATURES,
  resolveFlags,
  allFeaturesEnabled,
  isFeatureEnabled,
  featureForPath,
  isPathEnabled,
} from './feature-flags';

describe('feature-flags registry', () => {
  it('has unique feature ids', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks the admin control room and student home as core', () => {
    const core = new Set(FEATURES.filter((f) => f.core).map((f) => f.id));
    // Lockout-safety: admin must always reach Settings + Features.
    expect(core.has('staff.admin-settings')).toBe(true);
    expect(core.has('staff.admin-features')).toBe(true);
    // Students always keep a home.
    expect(core.has('student.dashboard')).toBe(true);
  });

  /**
   * Staff flags default ON so the people testing keep their tools. The one
   * exception is listed rather than the rule weakened, so a future flag cannot
   * quietly default OFF and disappear from a teacher's menu with nobody noticing.
   */
  const STAFF_DEFAULT_OFF = new Set([
    // Gates the nightly job that uploads class recordings to YouTube. Each
    // upload spends 1600 of a 10,000-unit daily quota the moment the session
    // opens, and a switch guarding a metered spend has to fail closed: turning
    // it on is a decision somebody makes once the OAuth grant is verified, not
    // something a deploy does on their behalf.
    'staff.youtube-auto-backup',
  ]);

  /**
   * Student flags default OFF so a deploy never puts a half-built screen in
   * front of a teenager. Exceptions are listed rather than the rule weakened,
   * for the same reason the staff list above is.
   */
  const STUDENT_DEFAULT_ON = new Set([
    // Catch-up is not a capability a teacher opts into, it is the safety net for
    // a student who was not in class. It has to be on for two reasons that both
    // fail silently otherwise: the overdue nudge we send links straight to this
    // page, so a student who cannot open it gets a message about work they
    // cannot find; and it is the only surface that tells them they owe anything
    // at all, so with it off a missed class stays exactly as invisible as it was
    // before any of this was built.
    'student.catchup',
  ]);

  it('defaults student features off and staff features on', () => {
    const student = FEATURES.filter(
      (f) => f.surface === 'student' && !f.core && !STUDENT_DEFAULT_ON.has(f.id),
    );
    const staff = FEATURES.filter(
      (f) => f.surface === 'staff' && !f.core && !STAFF_DEFAULT_OFF.has(f.id),
    );
    expect(student.every((f) => f.defaultEnabled === false)).toBe(true);
    expect(staff.every((f) => f.defaultEnabled === true)).toBe(true);
  });

  it('keeps every documented student exception actually defaulting on', () => {
    // Guards the other direction, exactly as the staff list does: if one of
    // these is later flipped OFF, this list is now a lie and this fails.
    for (const id of STUDENT_DEFAULT_ON) {
      const f = FEATURES.find((x) => x.id === id);
      expect(f, `${id} is in the exception list but not in the registry`).toBeDefined();
      expect(f!.defaultEnabled).toBe(true);
    }
  });

  it('keeps every documented staff exception actually defaulting off', () => {
    // Guards the other direction: if one of these is later flipped to default
    // ON, the exception list is now a lie and this fails.
    for (const id of STAFF_DEFAULT_OFF) {
      const f = FEATURES.find((x) => x.id === id);
      expect(f, `${id} is in the exception list but not in the registry`).toBeDefined();
      expect(f!.defaultEnabled).toBe(false);
      expect(f!.core).toBeFalsy();
    }
  });
});

describe('resolveFlags', () => {
  it('applies registry defaults when there are no overrides', () => {
    const flags = resolveFlags({});
    expect(flags['student.timetable']).toBe(false); // student default off
    expect(flags['staff.classrooms']).toBe(true); // staff default on
  });

  it('honours overrides but forces core features on', () => {
    const flags = resolveFlags({
      'student.timetable': true,
      'staff.classrooms': false,
      'staff.admin-settings': false, // attempt to disable a core feature
    });
    expect(flags['student.timetable']).toBe(true);
    expect(flags['staff.classrooms']).toBe(false);
    // Core cannot be turned off, even with an explicit override.
    expect(flags['staff.admin-settings']).toBe(true);
  });

  it('ignores unknown ids in overrides', () => {
    const flags = resolveFlags({ 'made.up': true } as Record<string, boolean>);
    expect(flags['made.up']).toBeUndefined();
  });
});

describe('allFeaturesEnabled', () => {
  it('turns every feature on (E2E test-mode fallback)', () => {
    const flags = allFeaturesEnabled();
    expect(FEATURES.every((f) => flags[f.id] === true)).toBe(true);
  });
});

describe('isFeatureEnabled', () => {
  const flags = resolveFlags({ 'student.timetable': true });
  it('reads a known enabled feature', () => {
    expect(isFeatureEnabled('student.timetable', flags)).toBe(true);
  });
  it('reads a known disabled feature', () => {
    expect(isFeatureEnabled('student.tests', flags)).toBe(false);
  });
  it('allows unknown ids', () => {
    expect(isFeatureEnabled('not.a.feature', flags)).toBe(true);
  });
});

describe('featureForPath (longest-prefix match)', () => {
  it('matches an exact nav path', () => {
    expect(featureForPath('/student/timetable')?.id).toBe('student.timetable');
  });

  it('matches a deep sub-route to its owning feature', () => {
    expect(featureForPath('/teacher/course-plans/abc/schedule')?.id).toBe('staff.course-plans');
  });

  it('prefers the longest prefix for nested features', () => {
    // Starred lives under study-materials; the more specific one must win.
    expect(featureForPath('/student/study-materials/starred')?.id).toBe(
      'student.study-materials-starred',
    );
    expect(featureForPath('/student/study-materials')?.id).toBe('student.study-materials');
    // Materials feedback is nested under the staff study-materials page.
    expect(featureForPath('/teacher/study-materials/feedback')?.id).toBe(
      'staff.study-materials-feedback',
    );
  });

  it('does not false-match a sibling that shares a prefix string', () => {
    // '/student/exam-recall' must NOT be captured by '/student/exams'.
    expect(featureForPath('/student/exam-recall')?.id).toBe('student.exam-recall');
    expect(featureForPath('/student/exams')?.id).toBe('student.exams');
  });

  it('matches both the class-recaps list and the single-recap player', () => {
    expect(featureForPath('/student/class-recaps')?.id).toBe('student.class-recaps');
    expect(featureForPath('/student/class-recap/xyz')?.id).toBe('student.class-recaps');
  });

  it('returns undefined for ungated routes', () => {
    expect(featureForPath('/student/complete-profile')).toBeUndefined();
    expect(featureForPath('/teacher/foundation/123')).toBeUndefined();
  });
});

describe('isPathEnabled', () => {
  it('blocks a disabled feature page and allows an enabled one', () => {
    const flags = resolveFlags({ 'student.timetable': true }); // tests stays off
    expect(isPathEnabled('/student/timetable', flags)).toBe(true);
    expect(isPathEnabled('/student/tests', flags)).toBe(false);
  });

  it('always allows ungated and core routes', () => {
    const flags = resolveFlags({});
    expect(isPathEnabled('/student/complete-profile', flags)).toBe(true); // ungated
    expect(isPathEnabled('/student/dashboard', flags)).toBe(true); // core
    expect(isPathEnabled('/teacher/admin/features', flags)).toBe(true); // core
  });
});

describe('student.photo-gate', () => {
  const flag = FEATURES.find((f) => f.id === 'student.photo-gate');

  it('is registered so it appears as a switch on the admin Features page', () => {
    expect(flag).toBeDefined();
    expect(flag?.surface).toBe('student');
  });

  it('defaults to OFF, so applying the migration alone locks nobody out', () => {
    expect(flag?.defaultEnabled).toBe(false);
    expect(resolveFlags({})['student.photo-gate']).toBe(false);
  });

  it('is not core, so an admin can always switch it back off', () => {
    expect(flag?.core).toBeFalsy();
    expect(resolveFlags({ 'student.photo-gate': false })['student.photo-gate']).toBe(false);
  });

  it('has no paths, so it can never gate a page by accident', () => {
    expect(flag?.paths).toEqual([]);
    // It must never be the owner of any route, including its own name.
    expect(featureForPath('/student/photo-gate')).toBeUndefined();
    expect(featureForPath('/student/dashboard')?.id).not.toBe('student.photo-gate');
  });
});

describe('staff.students-watchlist', () => {
  const flag = FEATURES.find((f) => f.id === 'staff.students-watchlist');

  it('follows the staff convention (defaults ON) but stays switchable off', () => {
    expect(flag?.defaultEnabled).toBe(true);
    expect(flag?.core).toBeFalsy();
    expect(resolveFlags({ 'staff.students-watchlist': false })['staff.students-watchlist']).toBe(
      false,
    );
  });

  it('beats staff.students for its own sub-path (longest prefix wins)', () => {
    expect(featureForPath('/teacher/students/watchlist')?.id).toBe('staff.students-watchlist');
    expect(featureForPath('/teacher/students')?.id).toBe('staff.students');
    expect(featureForPath('/teacher/students/city-wise')?.id).toBe('staff.students');
  });
});

describe('staff.photo-review', () => {
  it('defaults to ON so staff can clear the queue before the gate goes live', () => {
    expect(FEATURES.find((f) => f.id === 'staff.photo-review')?.defaultEnabled).toBe(true);
    expect(featureForPath('/teacher/photo-review')?.id).toBe('staff.photo-review');
  });
});

describe('staff.photo-ms-push', () => {
  const flag = FEATURES.find((f) => f.id === 'staff.photo-ms-push');

  it('is registered so it appears as a switch on the admin Features page', () => {
    expect(flag).toBeDefined();
    expect(flag?.surface).toBe('staff');
  });

  it('has no paths, so it can never gate a page by accident', () => {
    // It writes to a Microsoft identity, it does not own a route.
    expect(flag?.paths).toEqual([]);
    expect(featureForPath('/teacher/photo-ms-push')).toBeUndefined();
  });

  it('follows the staff convention (defaults ON) but stays switchable off', () => {
    // It must be switchable off, because until ProfilePhoto.ReadWrite.All is
    // consented in Azure every push returns 403.
    expect(flag?.defaultEnabled).toBe(true);
    expect(flag?.core).toBeFalsy();
    expect(resolveFlags({ 'staff.photo-ms-push': false })['staff.photo-ms-push']).toBe(false);
  });
});

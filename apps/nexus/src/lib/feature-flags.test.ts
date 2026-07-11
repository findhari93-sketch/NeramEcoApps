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

  it('defaults student features off and staff features on', () => {
    const student = FEATURES.filter((f) => f.surface === 'student' && !f.core);
    const staff = FEATURES.filter((f) => f.surface === 'staff' && !f.core);
    expect(student.every((f) => f.defaultEnabled === false)).toBe(true);
    expect(staff.every((f) => f.defaultEnabled === true)).toBe(true);
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

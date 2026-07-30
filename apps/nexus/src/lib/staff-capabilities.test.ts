import { describe, it, expect } from 'vitest';
import {
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  STAFF_ROLES,
  can,
  canRunSession,
  canTutor,
  canUser,
  capabilityMap,
  isInternalStaff,
  resolveStaffRole,
  type Capability,
  type StaffRole,
} from './staff-capabilities';

describe('resolveStaffRole', () => {
  it('prefers staff_role over user_type', () => {
    // The whole point of the split: full Admin app rights (user_type='admin')
    // with restricted Nexus authority (staff_role='manager').
    expect(resolveStaffRole({ user_type: 'admin', staff_role: 'manager' })).toBe('manager');
    expect(resolveStaffRole({ user_type: 'teacher', staff_role: 'manager' })).toBe('manager');
    expect(resolveStaffRole({ user_type: 'admin', staff_role: 'teacher' })).toBe('teacher');
  });

  it('falls back to user_type when staff_role is null, so nothing breaks mid-rollout', () => {
    expect(resolveStaffRole({ user_type: 'admin', staff_role: null })).toBe('admin');
    expect(resolveStaffRole({ user_type: 'teacher', staff_role: null })).toBe('teacher');
  });

  it('returns null for non-staff and for missing input', () => {
    expect(resolveStaffRole({ user_type: 'student', staff_role: null })).toBeNull();
    expect(resolveStaffRole({ user_type: 'lead', staff_role: null })).toBeNull();
    expect(resolveStaffRole({ user_type: 'parent', staff_role: null })).toBeNull();
    expect(resolveStaffRole(null)).toBeNull();
    expect(resolveStaffRole(undefined)).toBeNull();
  });

  it('ignores a staff_role value outside the union', () => {
    // A hand-edited or future DB value must not become authority.
    expect(resolveStaffRole({ user_type: 'student', staff_role: 'superuser' })).toBeNull();
    expect(resolveStaffRole({ user_type: 'student', staff_role: 'coordinator' })).toBeNull();
  });
});

describe('can (fail-closed)', () => {
  it('denies every capability to a null or unknown role', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
      expect(can('student' as unknown as StaffRole, capability)).toBe(false);
    }
  });

  it('denies a capability that is not in the role set', () => {
    expect(can('teacher', 'nonsense.capability' as Capability)).toBe(false);
    expect(can('admin', 'nonsense.capability' as Capability)).toBe(false);
  });
});

describe('admin tier', () => {
  it('holds every capability', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(can('admin', capability)).toBe(true);
    }
  });
});

describe('manager tier', () => {
  const managerDenied: Capability[] = [
    'system.roles',
    'system.feature_flags',
    'system.settings',
    'system.review_platforms',
    'structure.classroom.delete',
  ];

  it('is denied system configuration and classroom deletion', () => {
    for (const capability of managerDenied) {
      expect(can('manager', capability)).toBe(false);
    }
  });

  it('holds everything else the admin holds', () => {
    for (const capability of ALL_CAPABILITIES) {
      if (managerDenied.includes(capability)) continue;
      expect(can('manager', capability)).toBe(true);
    }
  });

  it('runs the cohort: enrolments, batches, scheduling, Teams linking', () => {
    expect(can('manager', 'structure.enrollment.add')).toBe(true);
    expect(can('manager', 'structure.enrollment.remove')).toBe(true);
    expect(can('manager', 'structure.batch.manage')).toBe(true);
    expect(can('manager', 'structure.classroom.create')).toBe(true);
    expect(can('manager', 'structure.classroom.teams_link')).toBe(true);
    expect(can('manager', 'teach.timetable.schedule')).toBe(true);
  });
});

describe('teacher tier (external, restricted)', () => {
  const teacherDenied: Capability[] = [
    'system.roles',
    'system.feature_flags',
    'system.settings',
    'system.review_platforms',
    'structure.classroom.create',
    'structure.classroom.delete',
    'structure.classroom.teams_link',
    'structure.batch.manage',
    'structure.enrollment.add',
    'structure.enrollment.remove',
    'structure.plan.delete',
    'teach.timetable.schedule',
    'coord.student.dormancy',
    'coord.photo_ms_push',
    'impersonate.any',
  ];

  it('loses the structural powers it used to have', () => {
    // These are the audit's highest-risk findings: before the split, any teacher
    // could remove students, delete a batch, or unlink the Teams team.
    for (const capability of teacherDenied) {
      expect(can('teacher', capability)).toBe(false);
    }
  });

  it('keeps teaching, grading, authoring and coordination', () => {
    expect(can('teacher', 'teach.session.run')).toBe(true);
    expect(can('teacher', 'teach.content.author')).toBe(true);
    expect(can('teacher', 'teach.assignment.write')).toBe(true);
    expect(can('teacher', 'teach.grade')).toBe(true);
    expect(can('teacher', 'teach.attendance.mark')).toBe(true);
    expect(can('teacher', 'teach.recap.publish')).toBe(true);
    expect(can('teacher', 'coord.student.view')).toBe(true);
    expect(can('teacher', 'coord.nudge')).toBe(true);
    expect(can('teacher', 'report.view')).toBe(true);
  });

  it('cannot schedule a class even though it can run one', () => {
    expect(can('teacher', 'teach.timetable.schedule')).toBe(false);
    expect(can('teacher', 'teach.session.run')).toBe(true);
  });

  it('can set a class or exam year, which is data entry after talking to a student', () => {
    // A wrong class is visible and self-correcting, so this is not worth a
    // manager's time. The public apply form got three Class 11 students tagged as
    // writing the exam this year; whoever notices should be able to fix it.
    expect(can('teacher', 'coord.student.stage')).toBe(true);
    expect(can('manager', 'coord.student.stage')).toBe(true);
    expect(can('admin', 'coord.student.stage')).toBe(true);
  });

  it('cannot mark a student dormant, which is the half that hides them', () => {
    // Dormant removes a student from attendance %, submission rates, prep
    // readiness, the watchlist and every automated reminder, with nothing on
    // screen turning red. A visiting teacher must not be able to do that.
    expect(can('teacher', 'coord.student.view')).toBe(true);
    expect(can('teacher', 'coord.student.dormancy')).toBe(false);
    expect(can('manager', 'coord.student.dormancy')).toBe(true);
    expect(can('admin', 'coord.student.dormancy')).toBe(true);
  });

  it('holds exactly one half of the old coord.student.classify', () => {
    // The asymmetry IS the feature. If a future refactor collapses these back
    // into one capability, this test is what should fail.
    expect(can('teacher', 'coord.student.stage')).toBe(true);
    expect(can('teacher', 'coord.student.dormancy')).toBe(false);
  });
});

describe('can_teach is orthogonal to the tier', () => {
  it('removes teach.tutor and nothing else from a manager', () => {
    // Shanthi: full operational authority, never takes a class.
    const nonTeaching = { user_type: 'admin', staff_role: 'manager', can_teach: false };
    const teaching = { user_type: 'admin', staff_role: 'manager', can_teach: true };

    expect(canUser(nonTeaching, 'teach.tutor')).toBe(false);
    expect(canUser(teaching, 'teach.tutor')).toBe(true);

    for (const capability of ALL_CAPABILITIES) {
      if (capability === 'teach.tutor') continue;
      expect(canUser(nonTeaching, capability)).toBe(canUser(teaching, capability));
    }
  });

  it('grants teach.tutor to every tier when can_teach is true', () => {
    for (const role of STAFF_ROLES) {
      expect(can(role, 'teach.tutor', true)).toBe(true);
      expect(can(role, 'teach.tutor', false)).toBe(false);
    }
  });

  it('never grants teach.tutor to a non-staff row, whatever can_teach says', () => {
    // can_teach defaults to true in the DB for every row, including students, so
    // the tier check must come first.
    expect(canTutor({ user_type: 'student', staff_role: null, can_teach: true })).toBe(false);
    expect(canTutor({ user_type: 'lead', staff_role: null, can_teach: true })).toBe(false);
    expect(canTutor(null)).toBe(false);
  });

  it('treats a null can_teach as teaching-eligible', () => {
    // Only an explicit false withdraws the tutor slot.
    expect(canUser({ staff_role: 'teacher', can_teach: null }, 'teach.tutor')).toBe(true);
    expect(canUser({ staff_role: 'teacher' }, 'teach.tutor')).toBe(true);
  });
});

describe('canRunSession (per-class scoping)', () => {
  const HARI = { id: 'u-hari', user_type: 'admin', staff_role: 'admin' };
  const SHANTHI = { id: 'u-shanthi', user_type: 'admin', staff_role: 'manager', can_teach: false };
  const SUDARSHINI = { id: 'u-sud', user_type: 'teacher', staff_role: 'teacher' };
  const SIVARAM = { id: 'u-siva', user_type: 'teacher', staff_role: 'teacher' };

  it('lets internal staff act on any class, including ones they do not tutor', () => {
    expect(canRunSession(HARI, 'u-sud')).toBe(true);
    expect(canRunSession(SHANTHI, 'u-sud')).toBe(true);
    // Even with no tutor assigned at all.
    expect(canRunSession(HARI, null)).toBe(true);
    expect(canRunSession(SHANTHI, undefined)).toBe(true);
  });

  it('lets an external teacher act only on their own class', () => {
    expect(canRunSession(SUDARSHINI, 'u-sud')).toBe(true);
    expect(canRunSession(SUDARSHINI, 'u-siva')).toBe(false);
    expect(canRunSession(SIVARAM, 'u-siva')).toBe(true);
    expect(canRunSession(SIVARAM, 'u-sud')).toBe(false);
  });

  it('denies an external teacher a class with no tutor', () => {
    // An unassigned class is the internal team's to sort out, not a free-for-all.
    expect(canRunSession(SUDARSHINI, null)).toBe(false);
    expect(canRunSession(SUDARSHINI, undefined)).toBe(false);
  });

  it('denies non-staff entirely, even when the ids happen to match', () => {
    const student = { id: 'u-stu', user_type: 'student', staff_role: null };
    expect(canRunSession(student, 'u-stu')).toBe(false);
    expect(canRunSession(null, 'u-stu')).toBe(false);
  });

  it('does not confuse can_teach with per-class access', () => {
    // Shanthi never tutors, but must still be able to run and reconcile any class.
    expect(canRunSession(SHANTHI, 'u-siva')).toBe(true);
    expect(canUser(SHANTHI, 'teach.tutor')).toBe(false);
  });

  it('falls back to user_type when staff_role is not yet backfilled', () => {
    expect(canRunSession({ id: 'a', user_type: 'admin', staff_role: null }, 'other')).toBe(true);
    expect(canRunSession({ id: 'b', user_type: 'teacher', staff_role: null }, 'other')).toBe(false);
    expect(canRunSession({ id: 'b', user_type: 'teacher', staff_role: null }, 'b')).toBe(true);
  });

  it('requires a caller id to match a tutor', () => {
    expect(canRunSession({ user_type: 'teacher', staff_role: 'teacher' }, 'u-sud')).toBe(false);
  });
});

describe('isInternalStaff', () => {
  it('is true for admin and manager only', () => {
    // Drives "see every class" and the Teams meeting attendee list.
    expect(isInternalStaff('admin')).toBe(true);
    expect(isInternalStaff('manager')).toBe(true);
    expect(isInternalStaff('teacher')).toBe(false);
    expect(isInternalStaff(null)).toBe(false);
    expect(isInternalStaff(undefined)).toBe(false);
  });
});

describe('capabilityMap', () => {
  it('always contains every capability, so a missing key means stale, not allowed', () => {
    for (const role of [...STAFF_ROLES, null]) {
      const map = capabilityMap(role);
      expect(Object.keys(map).sort()).toEqual([...ALL_CAPABILITIES].sort());
    }
  });

  it('is all false for a non-staff user', () => {
    const map = capabilityMap(null);
    expect(Object.values(map).every((v) => v === false)).toBe(true);
  });

  it('agrees with can() for every role and capability', () => {
    for (const role of STAFF_ROLES) {
      const map = capabilityMap(role);
      for (const capability of ALL_CAPABILITIES) {
        expect(map[capability]).toBe(can(role, capability));
      }
    }
  });

  it('reflects can_teach', () => {
    expect(capabilityMap('manager', false)['teach.tutor']).toBe(false);
    expect(capabilityMap('manager', true)['teach.tutor']).toBe(true);
  });
});

describe('registry integrity', () => {
  it('ALL_CAPABILITIES has no duplicates', () => {
    expect(new Set(ALL_CAPABILITIES).size).toBe(ALL_CAPABILITIES.length);
  });

  it('every capability in a role set is listed in ALL_CAPABILITIES', () => {
    // Guards against adding a capability to a role but forgetting the map, which
    // would make it invisible to the client.
    const known = new Set(ALL_CAPABILITIES);
    for (const role of STAFF_ROLES) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        expect(known.has(capability)).toBe(true);
      }
    }
  });

  it('the tiers are strictly nested: teacher subset of manager subset of admin', () => {
    for (const capability of ROLE_CAPABILITIES.teacher) {
      expect(ROLE_CAPABILITIES.manager.has(capability)).toBe(true);
    }
    for (const capability of ROLE_CAPABILITIES.manager) {
      expect(ROLE_CAPABILITIES.admin.has(capability)).toBe(true);
    }
  });

  it('does not put teach.tutor in any role set (it comes from can_teach)', () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_CAPABILITIES[role].has('teach.tutor')).toBe(false);
    }
  });

  it('reserves every system.* capability to the admin', () => {
    const systemCaps = ALL_CAPABILITIES.filter((c) => c.startsWith('system.'));
    expect(systemCaps.length).toBeGreaterThan(0);
    for (const capability of systemCaps) {
      expect(can('admin', capability)).toBe(true);
      expect(can('manager', capability)).toBe(false);
      expect(can('teacher', capability)).toBe(false);
    }
  });
});

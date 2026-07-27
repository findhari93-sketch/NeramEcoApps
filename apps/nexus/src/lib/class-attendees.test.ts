import { describe, it, expect } from 'vitest';
import { buildStaffAttendees, type StaffCalendarRow } from './class-attendees';

// The real cast of staff, so the assertions read like the actual requirement.
const HARI: StaffCalendarRow = {
  name: 'Hari Babu',
  email: 'Haribabu@neramclasses.com',
  ms_oid: 'oid-hari',
  user_type: 'admin',
  staff_role: 'admin',
};
const TAMIL: StaffCalendarRow = {
  name: 'Tamil Selvan',
  email: 'TamilSelvan@neramclasses.com',
  ms_oid: 'oid-tamil',
  user_type: 'admin',
  staff_role: 'manager',
};
const SHANTHI: StaffCalendarRow = {
  name: 'Shanthi',
  email: 'Shanthimano@nerasmclasses.onmicrosoft.com',
  ms_oid: 'oid-shanthi',
  user_type: 'admin',
  staff_role: 'manager',
};
const SUDARSHINI: StaffCalendarRow = {
  name: 'sudarshini Arjun',
  email: 'sudarshini@neramclasses.com',
  ms_oid: 'oid-sudarshini',
  user_type: 'teacher',
  staff_role: 'teacher',
};
const SIVARAM: StaffCalendarRow = {
  name: 'Sivaram',
  email: 'ar_sivaram@neramclasses.com',
  ms_oid: 'oid-sivaram',
  user_type: 'teacher',
  staff_role: 'teacher',
};

const ALL_STAFF = [HARI, TAMIL, SHANTHI, SUDARSHINI, SIVARAM];

const addressesOf = (list: ReturnType<typeof buildStaffAttendees>) =>
  list.map((a) => a.emailAddress.address.toLowerCase()).sort();

const requiredOf = (list: ReturnType<typeof buildStaffAttendees>) =>
  list.filter((a) => a.type === 'required').map((a) => a.emailAddress.address.toLowerCase());

describe('buildStaffAttendees', () => {
  it('invites the tutor plus the internal core team, and no other external teacher', () => {
    // The headline requirement: sudarshini teaches, so Sivaram must NOT be invited.
    const result = buildStaffAttendees(ALL_STAFF, 'sudarshini@neramclasses.com');

    expect(addressesOf(result)).toEqual([
      'haribabu@neramclasses.com',
      'shanthimano@nerasmclasses.onmicrosoft.com',
      'sudarshini@neramclasses.com',
      'tamilselvan@neramclasses.com',
    ]);
    expect(addressesOf(result)).not.toContain('ar_sivaram@neramclasses.com');
  });

  it('is symmetric: with Sivaram as tutor, sudarshini drops off', () => {
    const result = buildStaffAttendees(ALL_STAFF, 'ar_sivaram@neramclasses.com');

    expect(addressesOf(result)).toContain('ar_sivaram@neramclasses.com');
    expect(addressesOf(result)).not.toContain('sudarshini@neramclasses.com');
    // Internal team still sees it.
    expect(addressesOf(result)).toContain('haribabu@neramclasses.com');
    expect(addressesOf(result)).toContain('tamilselvan@neramclasses.com');
    expect(addressesOf(result)).toContain('shanthimano@nerasmclasses.onmicrosoft.com');
  });

  it('marks only the tutor as required, everyone else optional', () => {
    const result = buildStaffAttendees(ALL_STAFF, 'sudarshini@neramclasses.com');
    expect(requiredOf(result)).toEqual(['sudarshini@neramclasses.com']);
    expect(result.filter((a) => a.type === 'optional')).toHaveLength(3);
  });

  it('matches the tutor case-insensitively', () => {
    // Microsoft preserves admin-set UPN casing, so the two can differ in case.
    const result = buildStaffAttendees(ALL_STAFF, 'SUDARSHINI@NERAMCLASSES.COM');
    expect(requiredOf(result)).toEqual(['sudarshini@neramclasses.com']);
  });

  it('tolerates surrounding whitespace on the tutor email', () => {
    const result = buildStaffAttendees(ALL_STAFF, '  sudarshini@neramclasses.com  ');
    expect(requiredOf(result)).toEqual(['sudarshini@neramclasses.com']);
  });

  it('still marks an internal tutor as required rather than optional', () => {
    // Tamil is a manager who sometimes teaches as backup.
    const result = buildStaffAttendees(ALL_STAFF, 'TamilSelvan@neramclasses.com');
    expect(requiredOf(result)).toEqual(['tamilselvan@neramclasses.com']);
    expect(addressesOf(result)).not.toContain('sudarshini@neramclasses.com');
    expect(addressesOf(result)).not.toContain('ar_sivaram@neramclasses.com');
  });

  it('invites only internal staff when no tutor is resolved', () => {
    for (const empty of ['', null, undefined]) {
      const result = buildStaffAttendees(ALL_STAFF, empty);
      expect(addressesOf(result)).toEqual([
        'haribabu@neramclasses.com',
        'shanthimano@nerasmclasses.onmicrosoft.com',
        'tamilselvan@neramclasses.com',
      ]);
      expect(requiredOf(result)).toEqual([]);
    }
  });

  it('includes a non-teaching manager: can_teach does not affect calendar sight', () => {
    // Shanthi never takes a class but must see every class that runs.
    const result = buildStaffAttendees(
      [{ ...SHANTHI, ms_oid: 'oid-shanthi' }],
      'someone-else@neramclasses.com',
    );
    expect(addressesOf(result)).toEqual(['shanthimano@nerasmclasses.onmicrosoft.com']);
  });

  it('skips accounts with no mailbox to invite', () => {
    const rows: StaffCalendarRow[] = [
      { ...HARI, email: null },
      { ...TAMIL, ms_oid: null },
    ];
    expect(buildStaffAttendees(rows, '')).toEqual([]);
  });

  it('skips E2E test-login seeds even when they are the tutor', () => {
    const e2e: StaffCalendarRow = {
      name: 'Test Teacher',
      email: 'e2etestingteacher@neramclasses.com',
      ms_oid: 'test-oid-1775529264582',
      user_type: 'teacher',
      staff_role: 'manager',
    };
    // Local E2E runs write real rows, so this account exists in the real table
    // and would otherwise get a calendar invite for every class.
    expect(buildStaffAttendees([e2e], 'e2etestingteacher@neramclasses.com')).toEqual([]);
  });

  it('skips disabled accounts', () => {
    const rows = [{ ...TAMIL, is_disabled: true }, HARI];
    expect(addressesOf(buildStaffAttendees(rows, ''))).toEqual(['haribabu@neramclasses.com']);
  });

  it('falls back to user_type when staff_role is not yet backfilled', () => {
    // A staff row the migration has not reached keeps its previous behaviour:
    // user_type='admin' is internal, user_type='teacher' is external.
    const legacyAdmin: StaffCalendarRow = { ...HARI, staff_role: null };
    const legacyTeacher: StaffCalendarRow = { ...SIVARAM, staff_role: null };

    const result = buildStaffAttendees([legacyAdmin, legacyTeacher], '');
    expect(addressesOf(result)).toEqual(['haribabu@neramclasses.com']);
  });

  it('deduplicates repeated rows for the same mailbox', () => {
    const result = buildStaffAttendees([HARI, { ...HARI, name: 'Duplicate' }], '');
    expect(result).toHaveLength(1);
  });

  it('uses the email as the display name when the name is missing', () => {
    const result = buildStaffAttendees([{ ...HARI, name: null }], '');
    expect(result[0].emailAddress.name).toBe('Haribabu@neramclasses.com');
  });

  it('handles an empty or nullish staff list', () => {
    expect(buildStaffAttendees([], 'x@y.com')).toEqual([]);
    expect(buildStaffAttendees(null as never, 'x@y.com')).toEqual([]);
  });
});

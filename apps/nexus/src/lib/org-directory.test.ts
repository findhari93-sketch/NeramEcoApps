import { describe, it, expect } from 'vitest';
import {
  isOrgDomain,
  isOrgPersonAccount,
  buildEnrollmentBlocklist,
  isBlockedFromStudentEnrollment,
  selectAddableStudents,
  type EntraDirectoryUser,
} from './org-directory';

/**
 * Regression cover for the live tenant, 2026-07-28. Harimadhu@neramclasses.com signed
 * into Nexus and never showed up in the teacher "Not yet in class" list, because the
 * old filter dropped any UPN containing 'hari' as staff. Paramesh@nerasm... was hidden
 * the same way. The rule these tests pin down is that staff are recognised from their
 * `users` row, never from their name.
 */

const dir = (over: Partial<EntraDirectoryUser> = {}): EntraDirectoryUser => ({
  id: 'oid-student',
  displayName: 'Hari Madhu',
  userPrincipalName: 'Harimadhu@neramclasses.com',
  mail: 'Harimadhu@neramclasses.com',
  accountEnabled: true,
  ...over,
});

describe('isOrgDomain', () => {
  it('accepts all three real organisation domains', () => {
    // Verified against the tenant: these are the only org domains in use.
    expect(isOrgDomain('a@neramclasses.com')).toBe(true);
    expect(isOrgDomain('a@nerasmclasses.onmicrosoft.com')).toBe(true);
    expect(isOrgDomain('a@neram.co.in')).toBe(true);
  });

  it('is case and whitespace insensitive', () => {
    expect(isOrgDomain('  HariMadhu@NeramClasses.COM ')).toBe(true);
  });

  it('rejects an outside address that merely contains the brand name', () => {
    // The old rule was includes('neramclasses'), which let this through.
    expect(isOrgDomain('neramclasses@gmail.com')).toBe(false);
    expect(isOrgDomain('a@neramclasses.com.evil.co')).toBe(false);
  });

  it('rejects personal domains and empty input', () => {
    expect(isOrgDomain('a@gmail.com')).toBe(false);
    expect(isOrgDomain('no-domain-at-all')).toBe(false);
    expect(isOrgDomain('')).toBe(false);
    expect(isOrgDomain(null)).toBe(false);
    expect(isOrgDomain(undefined)).toBe(false);
  });
});

describe('isOrgPersonAccount', () => {
  it('accepts a student whose name contains a former staff pattern', () => {
    // THE BUG: 'harimadhu'.includes('hari') classified a student as staff.
    expect(isOrgPersonAccount(dir())).toBe(true);
  });

  it('accepts every real student the old name list was swallowing', () => {
    const swallowed = [
      'Harimadhu@neramclasses.com',
      'Paramesh@nerasmclasses.onmicrosoft.com',
      'Hariharan_Ganesan@neramclasses.com',
      'haripriya@neramclasses.com',
      'Tamilarasan@neramclasses.com',
      'adminesh@neramclasses.com',
    ];
    for (const upn of swallowed) {
      expect(isOrgPersonAccount(dir({ userPrincipalName: upn }))).toBe(true);
    }
  });

  it('still accepts staff accounts, because it is not the staff check', () => {
    // Deliberate: this function only reads the directory. Staff exclusion is the
    // blocklist's job, so keeping the two concerns separate is the whole fix.
    expect(isOrgPersonAccount(dir({ userPrincipalName: 'Haribabu@neramclasses.com' }))).toBe(true);
  });

  it('rejects a disabled account', () => {
    expect(isOrgPersonAccount(dir({ accountEnabled: false }))).toBe(false);
    expect(isOrgPersonAccount(dir({ accountEnabled: null }))).toBe(false);
  });

  it('rejects shared and service mailboxes by exact local part', () => {
    for (const upn of ['info@neramclasses.com', 'noreply@neramclasses.com', 'HR@neramclasses.com']) {
      expect(isOrgPersonAccount(dir({ userPrincipalName: upn }))).toBe(false);
    }
  });

  it('does not mistake a person for a service mailbox on a prefix', () => {
    // 'support' is a mailbox, 'supportraj' is a student.
    expect(isOrgPersonAccount(dir({ userPrincipalName: 'supportraj@neramclasses.com' }))).toBe(true);
    expect(isOrgPersonAccount(dir({ userPrincipalName: 'teamsri@neramclasses.com' }))).toBe(true);
  });

  it('rejects an account outside the organisation', () => {
    expect(isOrgPersonAccount(dir({ userPrincipalName: 'someone@gmail.com' }))).toBe(false);
  });

  it('rejects B2B guests whose UPN was rewritten onto our own domain', () => {
    // Both of these are live in the tenant and were being offered as students: the
    // UPN sits on nerasmclasses.onmicrosoft.com, only userType/#EXT# gives them away.
    expect(
      isOrgPersonAccount(
        dir({
          userPrincipalName: 'jayashree84_gmail.com#EXT#@nerasmclasses.onmicrosoft.com',
          mail: 'jayashree84@gmail.com',
          userType: 'Guest',
        })
      )
    ).toBe(false);
    expect(
      isOrgPersonAccount(
        dir({
          userPrincipalName: 'jayashree.raj_utas.edu.om#EXT#@nerasmclasses.onmicrosoft.com',
          mail: 'jayashree.raj@utas.edu.om',
          userType: 'Guest',
        })
      )
    ).toBe(false);
  });

  it('rejects a guest on the #EXT# marker even when userType is missing', () => {
    // Defence in depth: a trimmed $select must not silently readmit guests.
    expect(
      isOrgPersonAccount(
        dir({ userPrincipalName: 'x_gmail.com#EXT#@nerasmclasses.onmicrosoft.com', userType: null })
      )
    ).toBe(false);
  });

  it('keeps ordinary members, whether userType is present or absent', () => {
    expect(isOrgPersonAccount(dir({ userType: 'Member' }))).toBe(true);
    expect(isOrgPersonAccount(dir({ userType: null }))).toBe(true);
    expect(isOrgPersonAccount(dir({ userType: undefined }))).toBe(true);
  });

  it('rejects an account with no UPN rather than throwing', () => {
    expect(isOrgPersonAccount(dir({ userPrincipalName: null }))).toBe(false);
    expect(isOrgPersonAccount(dir({ userPrincipalName: '' }))).toBe(false);
  });
});

describe('buildEnrollmentBlocklist', () => {
  it('collects the ms_oid and every address on a row', () => {
    const list = buildEnrollmentBlocklist([
      {
        ms_oid: 'oid-staff',
        email: 'Haribabu@neramclasses.com',
        personal_email: 'findhari93@gmail.com',
        linked_classroom_email: 'Haribabu@neramclasses.com',
      },
    ]);
    expect(list.oids.has('oid-staff')).toBe(true);
    expect(list.emails.has('haribabu@neramclasses.com')).toBe(true);
    expect(list.emails.has('findhari93@gmail.com')).toBe(true);
  });

  it('lowercases addresses so Entra UPN casing cannot slip past', () => {
    // Entra preserves the casing an admin typed, PostgREST equality does not fold it.
    const list = buildEnrollmentBlocklist([{ email: 'HariHeera@neramclasses.com' }]);
    expect(list.emails.has('hariheera@neramclasses.com')).toBe(true);
  });

  it('skips null addresses and tolerates an empty input', () => {
    const list = buildEnrollmentBlocklist([
      { ms_oid: null, email: null, personal_email: null, linked_classroom_email: null },
    ]);
    expect(list.oids.size).toBe(0);
    expect(list.emails.size).toBe(0);
    expect(buildEnrollmentBlocklist([]).oids.size).toBe(0);
  });
});

describe('isBlockedFromStudentEnrollment', () => {
  const blocklist = buildEnrollmentBlocklist([
    { ms_oid: 'oid-admin', email: 'Haribabu@neramclasses.com', user_type: 'admin', staff_role: 'admin' },
    { ms_oid: 'oid-manager', email: 'TamilSelvan@neramclasses.com', user_type: 'admin', staff_role: 'manager' },
    { ms_oid: null, email: 'Hariharan_Ganesan@neramclasses.com', is_alumni: true },
  ]);

  it('blocks staff by identity, not by name', () => {
    expect(
      isBlockedFromStudentEnrollment(
        dir({ id: 'oid-admin', userPrincipalName: 'Haribabu@neramclasses.com' }),
        blocklist
      )
    ).toBe(true);
  });

  it('blocks a manager whose name shares a substring with a student', () => {
    // 'TamilSelvan' is staff and 'Tamilarasan' is a student. Only identity tells them apart.
    expect(
      isBlockedFromStudentEnrollment(dir({ id: 'oid-manager' }), blocklist)
    ).toBe(true);
    expect(
      isBlockedFromStudentEnrollment(
        dir({ id: 'oid-tamilarasan', userPrincipalName: 'Tamilarasan@neramclasses.com', mail: null }),
        blocklist
      )
    ).toBe(false);
  });

  it('blocks an alumnus whose row carries no ms_oid, by address', () => {
    // The graduated row's oid lives on a duplicate, so the oid check alone misses it.
    expect(
      isBlockedFromStudentEnrollment(
        dir({ id: 'oid-unknown', userPrincipalName: 'hariharan_ganesan@neramclasses.com', mail: null }),
        blocklist
      )
    ).toBe(true);
  });

  it('does not block the new student', () => {
    expect(isBlockedFromStudentEnrollment(dir(), blocklist)).toBe(false);
  });
});

describe('selectAddableStudents', () => {
  const directory: EntraDirectoryUser[] = [
    dir({ id: 'oid-madhu', userPrincipalName: 'Harimadhu@neramclasses.com', mail: 'Harimadhu@neramclasses.com' }),
    dir({ id: 'oid-paramesh', userPrincipalName: 'Paramesh@nerasmclasses.onmicrosoft.com', mail: null }),
    dir({ id: 'oid-heera', userPrincipalName: 'HariHeera@neramclasses.com', mail: null }),
    dir({ id: 'oid-admin', userPrincipalName: 'Haribabu@neramclasses.com', mail: null }),
    dir({ id: 'oid-noreply', userPrincipalName: 'noreply@neramclasses.com', mail: null }),
    dir({ id: 'oid-disabled', userPrincipalName: 'leaver@neramclasses.com', accountEnabled: false, mail: null }),
  ];

  const blocklist = buildEnrollmentBlocklist([
    { ms_oid: 'oid-admin', email: 'Haribabu@neramclasses.com', user_type: 'admin' },
  ]);

  it('offers exactly the two students the old filter was hiding', () => {
    // oid-heera is already enrolled, so it is correctly absent for a different reason.
    const addable = selectAddableStudents(directory, new Set(['oid-heera']), blocklist);
    expect(addable.map((u) => u.id)).toEqual(['oid-madhu', 'oid-paramesh']);
  });

  it('drops an already-enrolled student without dropping anyone else', () => {
    const addable = selectAddableStudents(directory, new Set(['oid-madhu', 'oid-heera']), blocklist);
    expect(addable.map((u) => u.id)).toEqual(['oid-paramesh']);
  });

  it('returns an empty list rather than throwing on empty input', () => {
    expect(selectAddableStudents([], new Set(), blocklist)).toEqual([]);
  });
});

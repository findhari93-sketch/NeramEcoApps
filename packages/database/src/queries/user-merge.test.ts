import { describe, it, expect } from 'vitest';
import { buildMergePreview, isNeramEmail, type MergeUserRow } from './user-merge';

/**
 * Survivor selection is the safety-critical part of the merge. merge_user_records
 * resolves the student_profiles UNIQUE(user_id) collision by DELETING the LOSER's
 * profile, so choosing the wrong survivor drops the student's real profile (fees,
 * enrolment date, NRM id) and then aborts on the direct_enrollment_links FK.
 *
 * Regression: the Chetana duplicate, 2026-07-28. "Sync from Entra" inserted a
 * second row for a student who already had a Google row. The shell it created
 * carries an ms_oid, so the old shell test (`!ms_oid && !firebase_uid && !google_id`)
 * never fired and the shell won.
 */

const row = (over: Partial<MergeUserRow>): MergeUserRow => ({
  id: 'id',
  name: null,
  email: null,
  personal_email: null,
  ms_oid: null,
  firebase_uid: null,
  google_id: null,
  phone: null,
  date_of_birth: null,
  academic_year: null,
  is_alumni: false,
  ...over,
});

describe('isNeramEmail', () => {
  it('accepts both org domains, case-insensitively', () => {
    expect(isNeramEmail('A_B@neramclasses.com')).toBe(true);
    expect(isNeramEmail('a@NERAM.CO.IN')).toBe(true);
  });

  it('rejects personal addresses and empty values', () => {
    expect(isNeramEmail('a@gmail.com')).toBe(false);
    expect(isNeramEmail(null)).toBe(false);
    // Not a suffix match: the domain must actually terminate the address.
    expect(isNeramEmail('a@neramclasses.com.evil.test')).toBe(false);
  });
});

describe('buildMergePreview survivor selection', () => {
  const syncEntraShell = row({
    id: 'shell',
    name: 'Chetana AjayKumar',
    email: 'Chetana_AjayKumar@neramclasses.com',
    ms_oid: 'dc403cac',
  });

  const googleRow = row({
    id: 'google',
    name: 'CHETANA ',
    email: 'chetanaagarwal5@gmail.com',
    firebase_uid: 'mSvRDFDKtZM2zTlWS88ha9yYx9h2',
    phone: '+919949414949',
  });

  it('keeps the row holding the real login when the org row is a sync-entra shell', () => {
    const { winner, loser } = buildMergePreview(syncEntraShell, googleRow);
    expect(winner.id).toBe('google');
    expect(loser.id).toBe('shell');
  });

  it('is order-independent', () => {
    const { winner } = buildMergePreview(googleRow, syncEntraShell);
    expect(winner.id).toBe('google');
  });

  it('still consolidates onto the org identity, whichever row survives', () => {
    const { afterMerge } = buildMergePreview(syncEntraShell, googleRow);
    expect(afterMerge.email).toBe('Chetana_AjayKumar@neramclasses.com');
    expect(afterMerge.personal_email).toBe('chetanaagarwal5@gmail.com');
    expect(afterMerge.ms_oid).toBe('dc403cac');
    expect(afterMerge.firebase_uid).toBe('mSvRDFDKtZM2zTlWS88ha9yYx9h2');
    expect(afterMerge.phone).toBe('+919949414949');
  });

  it('explains the swap so the admin sees why the Gmail row survives', () => {
    const { warnings } = buildMergePreview(syncEntraShell, googleRow);
    expect(warnings.some((w) => w.includes('provisioning shell'))).toBe(true);
  });

  it('still handles the original shell shape that has no ms_oid at all', () => {
    const hollow = row({ id: 'shell', email: 'A_B@neramclasses.com' });
    const rich = row({ id: 'google', email: 'a@gmail.com', firebase_uid: 'fb', ms_oid: 'oid' });
    expect(buildMergePreview(hollow, rich).winner.id).toBe('google');
  });

  it('does NOT demote a genuine Microsoft-only student who has personal details', () => {
    // No app login, but a phone on file means this is a real record, not a shell.
    const msOnly = row({ id: 'ms', email: 'A_B@neramclasses.com', ms_oid: 'oid', phone: '+919000000000' });
    const other = row({ id: 'g', email: 'a@gmail.com', firebase_uid: 'fb' });
    expect(buildMergePreview(msOnly, other).winner.id).toBe('ms');
  });

  it('does NOT swap when the personal row has no app login either', () => {
    const shell = row({ id: 'shell', email: 'A_B@neramclasses.com', ms_oid: 'oid' });
    const alsoEmpty = row({ id: 'other', email: 'a@gmail.com' });
    expect(buildMergePreview(shell, alsoEmpty).winner.id).toBe('shell');
  });

  it('refuses two different Microsoft accounts, which are two people', () => {
    const a = row({ id: 'a', email: 'A@neramclasses.com', ms_oid: 'oid-1', firebase_uid: 'fb1' });
    const b = row({ id: 'b', email: 'b@gmail.com', ms_oid: 'oid-2', firebase_uid: 'fb2' });
    const { warnings } = buildMergePreview(a, b);
    expect(warnings.some((w) => w.includes('Merge will be refused'))).toBe(true);
  });
});

/**
 * Students on one roster who may be the same person twice.
 *
 * The shape this looks for is the one that actually happened: a paid Gmail signup
 * (no Microsoft account) and a hand-made @neramclasses.com account for the same
 * student, both enrolled. It flags a record with no Microsoft account and a record
 * with one that share a first name. It only flags; merging stays a human decision
 * in Admin, because first names collide between different students.
 */

import { firstNameKey } from './identity-candidates';

export interface DuplicateRosterRow {
  id: string;
  name: string | null;
  ms_oid: string | null;
}

export interface DuplicatePartner {
  id: string;
  name: string;
}

export function findRosterDuplicates(rows: DuplicateRosterRow[]): Map<string, DuplicatePartner> {
  const withMicrosoft = new Map<string, DuplicateRosterRow>();
  for (const row of rows || []) {
    if (!row.ms_oid) continue;
    const key = firstNameKey(row.name);
    if (key.length >= 3 && !withMicrosoft.has(key)) withMicrosoft.set(key, row);
  }

  const flags = new Map<string, DuplicatePartner>();
  for (const row of rows || []) {
    if (row.ms_oid) continue;
    const key = firstNameKey(row.name);
    if (key.length < 3) continue;
    const partner = withMicrosoft.get(key);
    if (!partner) continue;
    flags.set(row.id, { id: partner.id, name: partner.name || 'Unnamed student' });
    if (!flags.has(partner.id)) flags.set(partner.id, { id: row.id, name: row.name || 'Unnamed student' });
  }
  return flags;
}

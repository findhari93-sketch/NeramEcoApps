/**
 * Could this Microsoft account belong to a student who is already enrolled
 * without one?
 *
 * A student who pays through the marketing link is enrolled on their Google
 * record before any @neramclasses.com account exists. When staff later add the
 * new Microsoft account, nothing on the two records has to agree: the Entra
 * account is made by hand with no phone, and the names differ ("Afrin" and
 * "Afrin banu"). This module proposes likely matches so a person can confirm.
 *
 * It only ever PROPOSES. First names collide between different students, which
 * past merges proved, so nothing is linked without a human saying yes.
 *
 * Pure, so the route and the tests share one rule.
 */

import { phoneticKey } from './people-search';

/** A classroom student who has no Microsoft account yet. */
export interface IdentityCandidateRow {
  user_id: string;
  name: string | null;
  email: string | null;
  personal_email?: string | null;
  phone?: string | null;
  enrolled_at?: string | null;
}

/** What is known about the Microsoft account being added. */
export interface DirectoryIdentity {
  name: string | null;
  upn: string | null;
  phones?: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
}

export type CandidateReason = 'phone' | 'email' | 'name';

/** A proposed match, safe to send to the browser (no phone number). */
export interface IdentityCandidate {
  user_id: string;
  name: string | null;
  email: string | null;
  enrolled_at: string | null;
  reason: CandidateReason;
}

const REASON_ORDER: Record<CandidateReason, number> = { phone: 0, email: 1, name: 2 };

/** Last ten digits, or null when there are fewer. Indian mobiles are ten digits after +91. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Phonetic key of the first name, from a display name or an address local part. */
export function firstNameKey(nameOrAddress: string | null | undefined): string {
  const local = String(nameOrAddress || '').split('@')[0].trim();
  const first = local.split(/[\s._-]+/)[0] || '';
  // A camelCase mailbox such as "HariHeera" starts its second word at the hump.
  const hump = first.match(/^[A-Z]?[a-z]+/);
  return phoneticKey(hump ? hump[0] : first);
}

function lowerAddresses(values: Array<string | null | undefined>): string[] {
  return values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.includes('@'));
}

export function findIdentityCandidates(
  account: DirectoryIdentity,
  rows: IdentityCandidateRow[],
): IdentityCandidate[] {
  const phones = new Set(
    (account.phones || []).map(normalizePhone).filter((phone): phone is string => !!phone),
  );
  const emails = new Set(lowerAddresses([account.upn, ...(account.emails || [])]));
  const nameKeys = new Set(
    [firstNameKey(account.name), firstNameKey(account.upn)].filter((key) => key.length >= 3),
  );

  const found: IdentityCandidate[] = [];
  for (const row of rows || []) {
    let reason: CandidateReason | null = null;

    const rowPhone = normalizePhone(row.phone);
    if (rowPhone && phones.has(rowPhone)) {
      reason = 'phone';
    } else if (lowerAddresses([row.email, row.personal_email]).some((address) => emails.has(address))) {
      reason = 'email';
    } else {
      const key = firstNameKey(row.name);
      if (key.length >= 3 && nameKeys.has(key)) reason = 'name';
    }

    if (reason) {
      found.push({
        user_id: row.user_id,
        name: row.name,
        email: row.email ?? row.personal_email ?? null,
        enrolled_at: row.enrolled_at ?? null,
        reason,
      });
    }
  }

  return found.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]);
}

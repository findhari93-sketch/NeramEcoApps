/**
 * Which application form belongs to a Nexus student whose own record has none?
 *
 * The public apply form signs a student in by phone and makes a users row named
 * "User" (the name they typed goes to first_name). Their Microsoft account is made
 * later by hand, with no phone, on a second row. Nothing joins the two, so the form
 * that holds their class and exam year never reaches Nexus.
 *
 * This proposes those rows. It never links anything: a person confirms, because
 * siblings share a parent's phone and first names repeat.
 *
 *   strong   the same phone number or email address
 *   likely   the first name AND one more word agree, either a surname on the form
 *            or a word of the father's name. A first name alone is never enough.
 *
 * Pure, so the route and the tests share one rule.
 */

import { editDistance, phoneticKey } from './people-search';
import { normalizePhone } from './identity-candidates';

export type FormMatchReason = 'phone' | 'email' | 'full_name' | 'father_name';
export type FormMatchStrength = 'strong' | 'likely';

export interface MatchStudent {
  id: string;
  name: string | null;
  /** users.phone plus whatever the Microsoft directory holds for them. */
  phones: Array<string | null | undefined>;
  /** Classroom, personal and directory addresses. */
  emails: Array<string | null | undefined>;
}

export interface FormIdentity {
  userId: string;
  /** Every name the record carries: users.name, first_name, last_name, the form's first_name. */
  names: Array<string | null | undefined>;
  fatherName: string | null;
  phones: Array<string | null | undefined>;
  emails: Array<string | null | undefined>;
}

export interface FormMatch {
  userId: string;
  strength: FormMatchStrength;
  reasons: FormMatchReason[];
}

/** What the apply flow writes before a person types their own name. */
const PLACEHOLDER_NAMES = new Set(['user', 'student', 'unnamed student']);

/** Initials and two-letter tokens ("SR") are too common to count as evidence. */
const MIN_WORD = 3;

/** Spelling-folded words of a name, in order, without placeholders or initials. */
export function nameWords(text: string | null | undefined): string[] {
  const raw = String(text || '').split('@')[0].trim();
  if (PLACEHOLDER_NAMES.has(raw.toLowerCase())) return [];
  const words = raw
    // A camelCase mailbox such as "AnoopPuthan" holds two words.
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map(phoneticKey)
    .filter((word) => word.length >= MIN_WORD);
  return Array.from(new Set(words));
}

/** One typo is forgiven in longer words ("Kavya" and "Kaviya"), never in short ones. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1;
}

function hasWord(words: readonly string[], word: string): boolean {
  return words.some((candidate) => sameWord(candidate, word));
}

function addresses(values: Array<string | null | undefined>): string[] {
  return values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.includes('@'));
}

export function matchApplicationForms(student: MatchStudent, forms: readonly FormIdentity[]): FormMatch[] {
  const phones = new Set(student.phones.map(normalizePhone).filter((phone): phone is string => !!phone));
  const emails = new Set(addresses(student.emails));
  const [first, ...rest] = nameWords(student.name);

  const matches: FormMatch[] = [];
  for (const form of forms || []) {
    if (form.userId === student.id) continue;
    const reasons: FormMatchReason[] = [];

    if (form.phones.some((raw) => phones.has(normalizePhone(raw) ?? ''))) reasons.push('phone');
    if (addresses(form.emails).some((address) => emails.has(address))) reasons.push('email');

    if (first) {
      const formWords = Array.from(new Set(form.names.flatMap((name) => nameWords(name))));
      if (hasWord(formWords, first)) {
        if (rest.some((word) => hasWord(formWords, word))) reasons.push('full_name');
        const fatherWords = nameWords(form.fatherName);
        if (rest.some((word) => hasWord(fatherWords, word))) reasons.push('father_name');
      }
    }

    if (!reasons.length) continue;
    const strength: FormMatchStrength =
      reasons.includes('phone') || reasons.includes('email') ? 'strong' : 'likely';
    matches.push({ userId: form.userId, strength, reasons });
  }

  return matches.sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
    return b.reasons.length - a.reasons.length;
  });
}

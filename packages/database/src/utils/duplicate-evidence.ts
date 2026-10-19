/**
 * Plain-words explanations for the Duplicates queue.
 *
 * The queue used to show a bare chip ("Enrolment link phone matches", "Strong
 * match") with nothing to check it against. Staff could not see that the number
 * behind Kaira Rohit's match was one typed on her enrolment link, not her own.
 * These helpers turn a candidate's evidence into one sentence a person can
 * verify, plus words for who the other record probably is and why a pair waits.
 */

import { formatPhoneForDisplay } from './phone';

export type RelationGuess = 'self' | 'parent' | 'unknown';

/** How long a merge can be undone (unmerge_user_records enforces the same). */
export const UNDO_WINDOW_DAYS = 30;

export type BlockedReason =
  | 'shared_number'
  | 'staff_number'
  | 'two_students'
  | 'guardian_account'
  | 'names_differ'
  | 'undone'
  | 'recheck'
  | 'two_microsoft';

export interface EvidencePerson {
  id: string;
  name: string | null;
  phone?: string | null;
  email?: string | null;
  user_type?: string | null;
}

export interface DuplicateEvidence {
  kind?: 'email' | 'classroom_email' | 'phone' | 'link_phone' | 'contact';
  value?: string | null;
  link_name?: string | null;
  link_created_at?: string | null;
  typed_for?: string | null;
  holder?: string | null;
  contact_of?: string | null;
  relation?: string | null;
  source?: string | null;
}

/** "Kaira Rohit", or a description when the record never got a real name. */
export function personLabel(p: EvidencePerson | null | undefined): string {
  const name = (p?.name || '').trim();
  if (name && name.toLowerCase() !== 'user') return name;
  if (p?.user_type === 'student') return 'an unnamed student';
  return 'an unnamed lead';
}

/** 2 Jul 2026, always in India time (a UTC date read a day early once). */
export function shortDateIST(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * One sentence: what matched, and where each side got it. `a` and `b` are the
 * pair in any order; the evidence names which one held what.
 */
export function describeDuplicateEvidence(
  reason: string,
  evidence: DuplicateEvidence | null | undefined,
  a: EvidencePerson | null,
  b: EvidencePerson | null,
): string {
  const byId = (id?: string | null) => (id && a?.id === id ? a : id && b?.id === id ? b : null);
  const other = (p: EvidencePerson | null) => (p && p === a ? b : a);
  const ev = evidence || {};

  switch (ev.kind) {
    case 'link_phone': {
      const typedFor = byId(ev.typed_for);
      const holder = byId(ev.holder) || other(typedFor);
      const when = shortDateIST(ev.link_created_at);
      const linkName = (ev.link_name || '').trim();
      const phone = formatPhoneForDisplay(ev.value);
      const onLink = linkName ? `${linkName}'s enrolment link` : 'an enrolment link';
      return (
        `Staff typed ${phone} on ${onLink}${when ? ` on ${when}` : ''}. ` +
        `${cap(personLabel(typedFor))} enrolled through that link from ${typedFor?.phone ? formatPhoneForDisplay(typedFor.phone) : 'another number'}, ` +
        `and ${phone} belongs to ${personLabel(holder)}.`
      );
    }
    case 'contact': {
      const owner = byId(ev.contact_of);
      const holder = byId(ev.holder) || other(owner);
      const phone = formatPhoneForDisplay(ev.value);
      const where =
        ev.source === 'lead_form'
          ? `is the parent phone on ${personLabel(owner)}'s application`
          : ev.source === 'enrolment_link'
            ? `was typed by staff on ${personLabel(owner)}'s enrolment link`
            : ev.relation === 'parent'
              ? `is saved as a parent number on ${personLabel(owner)}'s record`
              : `is saved on ${personLabel(owner)}'s record`;
      return `${phone} ${where}, and ${personLabel(holder)} signed up with it.`;
    }
    case 'phone':
      return `Both records have the number ${formatPhoneForDisplay(ev.value)}.`;
    case 'email':
      return `Both records use the email ${ev.value}.`;
    case 'classroom_email': {
      const holder = byId(ev.holder);
      return `${cap(personLabel(holder))} was linked to the classroom account ${ev.value}, which is the other record's email.`;
    }
    default:
      break;
  }

  switch (reason) {
    case 'phone_otp_conflict':
      return 'At sign-in, a phone OTP was refused because the other record already owns that number.';
    case 'entra_upn':
      return 'The Microsoft account for one record is already attached to the other.';
    case 'application_form':
      return 'An application form on one record names the other.';
    case 'staff':
      return 'Flagged by staff.';
    case 'same_phone':
      return 'Both records have the same phone number.';
    case 'same_email':
      return 'Both records use the same email.';
    default:
      return 'These records share a phone number or email.';
  }
}

export const RELATION_LABELS: Record<RelationGuess, string> = {
  self: 'Same person',
  parent: 'Parent and student',
  unknown: 'Not sure who',
};

/** Why a pair waits for a person instead of merging on its own. */
export function describeBlockedReason(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'shared_number':
      return 'This number is on 3 or more records, such as siblings or a shared family phone.';
    case 'staff_number':
      return 'A staff member uses this number.';
    case 'two_students':
      return 'Both are students. Siblings often share a parent’s number.';
    case 'guardian_account':
      return 'One record is already set up as a parent account for the other.';
    case 'names_differ':
      return 'The names differ and nothing else says they are family. It could be a parent or a sibling.';
    case 'undone':
      return 'Someone undid this merge, so it now waits for a person.';
    case 'recheck':
      return 'One of these records was merged with someone else since. Check again.';
    case 'two_microsoft':
      return 'Both records have their own Microsoft account, so they are two people.';
    default:
      return null;
  }
}

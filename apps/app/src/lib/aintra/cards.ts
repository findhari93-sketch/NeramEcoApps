/**
 * Aintra inside the student app (2026-10-20): the one Neram assistant, which
 * also lives on neramclasses.com. Here it does a signed-in student's jobs:
 * what they have booked and applied for, what they owe, a support ticket,
 * their exam year, their saved colleges, their notifications. Calculators and
 * college predictions are handed to /ask (Ask aiArchitek), which folds into
 * Aintra once that work lands.
 *
 * A tool result reaches the student as a card event on the stream, the way
 * /ask does it, never as text the model writes. Cards that change something
 * (a ticket, the exam year) wait for the student's tap and post to the app's
 * own routes, so their checks still apply.
 */

export interface CardLink {
  label: string;
  href: string;
  /** The first, filled button. */
  primary?: boolean;
  /** Opens neramclasses.com (a new tab), not a page of this app. */
  external?: boolean;
}

export type AintraCard =
  /** Read-only facts with buttons to where each thing is done. */
  | { kind: 'links'; title: string; lines: { label: string; value: string }[]; links: CardLink[]; note?: string }
  /** A support ticket to check and send (POST /api/support-tickets). */
  | { kind: 'ticket'; category: string; subject: string; description: string }
  /** The exam year to confirm (POST /api/exam-year). */
  | { kind: 'exam-year'; year: number | null; choices: number[] };

export type AintraEvent =
  | { t: 'status'; text: string }
  | { t: 'delta'; text: string }
  | { t: 'reset' }
  | { t: 'card'; card: AintraCard }
  | { t: 'done'; model?: string }
  | { t: 'error'; error: string; code?: string };

export const MARKETING_ORIGIN = (process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com').replace(/\/$/, '');

/** A neramclasses.com page, opened from the app. */
export function marketingLink(path: string): string {
  return `${MARKETING_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

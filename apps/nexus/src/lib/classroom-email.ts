/**
 * Classroom email domain classification (Nexus-local).
 *
 * A student's "class identity" is their @neramclasses.com Microsoft account.
 * Historically some accounts still sit on the default Microsoft tenant domain
 * (…@nerasmclasses.onmicrosoft.com) and many students' primary `users.email`
 * is still a personal Gmail. We prefer the custom-domain address for display
 * and flag anything that still needs correcting.
 *
 * Kept in apps/nexus (not packages/) on purpose: editing a shared package would
 * rebuild all four apps. Mirrors the geo-students.ts precedent. The Admin app
 * keeps its own inline classifier for the same reason.
 */

export type EmailDomainStatus = 'org' | 'onmicrosoft' | 'personal' | 'none';

/**
 * Classify an email by its domain tier.
 *   org         -> @neramclasses.com (the custom domain, the good one)
 *   onmicrosoft -> …@*.onmicrosoft.com (default tenant, needs an Entra rename)
 *   personal    -> anything else (gmail, etc.)
 *   none        -> null / empty
 *
 * NOTE: the tenant default is `nerasmclasses.onmicrosoft.com` (note the "nerasm"
 * spelling). It is onmicrosoft, NOT org, so the onmicrosoft test must come first.
 */
export function classifyDomain(email: string | null | undefined): EmailDomainStatus {
  if (!email) return 'none';
  const e = email.toLowerCase().trim();
  if (!e) return 'none';
  if (/\.onmicrosoft\.com$/.test(e)) return 'onmicrosoft';
  if (/@.*neramclasses\.com$/.test(e)) return 'org';
  return 'personal';
}

/** Rank so we can pick the best-available classroom email: org > onmicrosoft > personal. */
const STATUS_RANK: Record<EmailDomainStatus, number> = {
  org: 3,
  onmicrosoft: 2,
  personal: 1,
  none: 0,
};

export interface ClassroomEmailInput {
  ms_teams_email?: string | null;
  linked_classroom_email?: string | null;
  email?: string | null;
}

export interface ClassroomEmailResult {
  /** Best display email (org preferred), or null if the student has no email at all. */
  email: string | null;
  /** Domain tier of the chosen email. */
  status: EmailDomainStatus;
}

/**
 * Pick the best classroom email across the stored identity fields, preferring
 * the custom domain. Returns the chosen address and its domain status so the UI
 * can flag onmicrosoft / personal / missing.
 */
export function pickClassroomEmail(input: ClassroomEmailInput): ClassroomEmailResult {
  const candidates = [input.ms_teams_email, input.linked_classroom_email, input.email];

  let best: string | null = null;
  let bestStatus: EmailDomainStatus = 'none';

  for (const candidate of candidates) {
    if (!candidate) continue;
    const status = classifyDomain(candidate);
    if (status === 'none') continue;
    if (STATUS_RANK[status] > STATUS_RANK[bestStatus]) {
      best = candidate;
      bestStatus = status;
      if (bestStatus === 'org') break; // nothing beats org
    }
  }

  return { email: best, status: bestStatus };
}

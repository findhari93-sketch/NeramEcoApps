import type { AppStatusSummary } from '@/hooks/useApplicationStatus';
import type { DemoCta } from '@/lib/demo-cta';

/**
 * The Site Header state map (design handoff, "Site Header"). One table decides
 * the secondary button, the primary button, the status dot and the account
 * ring for every visitor. The geometry never changes; only labels do.
 * It replaces the old getCtaConfig + HeaderCtaPill colour flipping.
 */

export type HeaderStateKey =
  | 'guest'
  | 'signedIn'
  | 'demoBooked'
  | 'draft'
  | 'review'
  | 'approved'
  | 'enrolled'
  | 'applyPage';

export type SecondaryKind = 'freeDemo' | 'myDemo' | 'myEnrollment';
export type PrimaryKind = 'join' | 'continue' | 'track' | 'pay' | 'app' | 'help';
/** Dot colour roles: siteTokens.statusDraft / statusReview / statusDone. */
export type StatusDot = 'draft' | 'review' | 'done';

export interface HeaderState {
  key: HeaderStateKey;
  secondary: { kind: SecondaryKind; href: string } | null;
  /** href null = a button (Go to App runs the SSO hand-off). */
  primary: { kind: PrimaryKind; href: string | null; ghost: boolean };
  dot: StatusDot | null;
  /** Solid gold ring around the avatar (enrolled students). */
  goldRing: boolean;
}

/** Translation keys under `header.` for each primary label, per width tier. */
export const PRIMARY_LABELS: Record<PrimaryKind, { full: string; compact: string; short: string }> = {
  join: { full: 'joinNow', compact: 'joinNow', short: 'joinShort' },
  continue: { full: 'continueApplication', compact: 'continueShort', short: 'continueShort' },
  track: { full: 'trackApplication', compact: 'trackShort', short: 'trackShort' },
  pay: { full: 'payAndJoin', compact: 'payAndJoin', short: 'payShort' },
  app: { full: 'goToApp', compact: 'goToApp', short: 'appShort' },
  help: { full: 'needHelp', compact: 'needHelp', short: 'helpShort' },
};

export const SECONDARY_LABELS: Record<SecondaryKind, string> = {
  freeDemo: 'freeDemo',
  myDemo: 'myDemo',
  myEnrollment: 'myEnrollment',
};

/** Translation key under `header.` for the drawer's account sentence. */
export const STATUS_SENTENCES: Record<HeaderStateKey, string | null> = {
  guest: null,
  signedIn: 'statusNoApplication',
  demoBooked: 'statusDemoBooked',
  draft: 'statusDraft',
  review: 'statusReview',
  approved: 'statusApproved',
  enrolled: 'statusEnrolled',
  applyPage: 'statusApplying',
};

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(en|ta|hi|kn|ml)(?=\/|$)/, '') || '/';
}

export function getHeaderState(opts: {
  status: AppStatusSummary;
  signedIn: boolean;
  /** From getDemoCta: null hides the demo button (demo pages, approved, enrolled). */
  demo: DemoCta | null;
  pathname: string;
}): HeaderState {
  const { status, signedIn, demo } = opts;
  const path = stripLocale(opts.pathname);
  const demoButton = demo ? { kind: demo.label, href: demo.href } : null;
  const apply = { kind: 'join' as PrimaryKind, href: '/apply', ghost: false };

  if (path === '/apply') {
    return { key: 'applyPage', secondary: null, primary: { kind: 'help', href: '/contact', ghost: true }, dot: null, goldRing: false };
  }
  switch (status) {
    case 'enrolled':
    case 'partial_payment':
      return {
        key: 'enrolled',
        secondary: { kind: 'myEnrollment', href: '/my-enrollment' },
        primary: { kind: 'app', href: null, ghost: false },
        dot: 'done',
        goldRing: true,
      };
    case 'approved':
      return { key: 'approved', secondary: null, primary: { ...apply, kind: 'pay' }, dot: 'done', goldRing: false };
    case 'submitted':
    case 'under_review':
    case 'pending_verification':
      return { key: 'review', secondary: demoButton, primary: { ...apply, kind: 'track' }, dot: 'review', goldRing: false };
    case 'draft':
      return { key: 'draft', secondary: demoButton, primary: { ...apply, kind: 'continue' }, dot: 'draft', goldRing: false };
    default:
      break;
  }
  if (demo?.label === 'myDemo') {
    return { key: 'demoBooked', secondary: demoButton, primary: apply, dot: null, goldRing: false };
  }
  return { key: signedIn ? 'signedIn' : 'guest', secondary: demoButton, primary: apply, dot: null, goldRing: false };
}

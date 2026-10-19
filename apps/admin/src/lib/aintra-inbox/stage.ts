/**
 * Lead stage of a person who chatted with Aintra. Facts beat guesses: an
 * enrolment, a demo booking or an application decides it; otherwise what they
 * asked about lately (fees, timings, demo) marks a hot lead.
 */
import { isHot, type Intent } from './intents';
import type { InboxUser, LeadStage } from './types';

const HOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function leadStage(input: {
  user: Pick<InboxUser, 'enrolled' | 'demoBooked' | 'applied' | 'callbackAsked'> | null;
  /** Intents of questions asked within the hot window. */
  recentIntents: Intent[];
  /** Intents over all their questions. */
  allIntents: Intent[];
}): LeadStage {
  const { user, recentIntents, allIntents } = input;
  if (user?.enrolled) return 'Enrolled';
  if (user?.demoBooked) return 'Demo booked';
  if (user?.callbackAsked) return 'Callback asked';
  if (user?.applied) return 'Applied';
  if (user) return isHot(recentIntents) ? 'Hot lead' : 'Warm';
  return isHot(allIntents) ? 'Warm' : 'Unknown';
}

export function isRecent(iso: string, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() <= HOT_WINDOW_MS;
}

/** Stages staff should act on first. */
export const ACTIONABLE_STAGES: ReadonlySet<LeadStage> = new Set<LeadStage>(['Hot lead', 'Demo booked', 'Callback asked']);

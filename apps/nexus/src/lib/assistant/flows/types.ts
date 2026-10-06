import type { Attachment, Suggestion } from '@/lib/assistant/types';
import type { UpcomingClass } from '@/lib/upcoming-classes';

export const FLOW_TTL_MS = 10 * 60_000;

/** What a tool or flow asks the person to confirm. Becomes a pending action row. */
export interface Proposal {
  kind: string;
  args: Record<string, unknown>;
  summary: string;
  fields: Array<{ label: string; value: string }>;
}

export interface FlowState {
  flow: 'cannot-attend' | 'remind-me' | 'upload-sketch';
  step: string;
  data: Record<string, unknown>;
  startedAt: string;
  /** Answers in a row the step did not understand. Set by the turn, never by a flow. */
  misses?: number;
}

export interface FlowInput {
  text: string;
  attachment?: Attachment | null;
}

export interface FlowDeps {
  today: string;
  /** Injected clock; stamps startedAt so isStale agrees with the turn's clock. */
  now: Date;
  /** Upcoming classes within two weeks, already filtered for the student's classroom. */
  upcoming: UpcomingClass[];
  /** Ids among `upcoming` the student has already declined. */
  declined: Set<string>;
}

export interface FlowOutcome {
  /** Null when the flow has ended (proposal made, or nothing to do). */
  state: FlowState | null;
  reply: string;
  suggestions: Suggestion[];
  propose?: Proposal;
  wantsAttachment?: boolean;
  /** The step did not understand the answer and asked again. The turn may hand the message on instead. */
  miss?: true;
}

export const chip = (label: string, send: string = label): Suggestion => ({ label, send });

export function isStale(state: FlowState, now: Date): boolean {
  return now.getTime() - Date.parse(state.startedAt) > FLOW_TTL_MS;
}

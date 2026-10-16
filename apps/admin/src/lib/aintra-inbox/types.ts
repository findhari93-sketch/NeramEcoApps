/**
 * Shapes for Aintra Inbox. Rows are chatbot_conversations turns (one question
 * and its answer); a conversation is every turn of one chat session; a person
 * is a signed-in user, or a guest known by the neram_anon_id cookie (older
 * guest chats, before the cookie was logged, are one person per session).
 */
import type { Intent } from './intents';

export type TurnStatus = 'error' | 'review' | 'none' | 'corrected' | 'ok';

export type LeadStage = 'Enrolled' | 'Demo booked' | 'Applied' | 'Hot lead' | 'Warm' | 'Unknown';

export type AiVerdict = 'correct' | 'needs_fix' | 'wrong' | 'uncertain';

export interface AiReview {
  verdict: AiVerdict;
  reasoning: string;
  suggestedCorrection: string;
  reviewedAt?: string;
  model?: string;
  /** Set when the turn had no answer and the review drafted one instead of grading. */
  drafted?: boolean;
}

export interface ToolCall {
  name?: string;
  success?: boolean;
}

/** Light row used for the list, people and insights (no answer text). */
export interface InboxRow {
  id: string;
  session_id: string;
  user_id: string | null;
  user_message: string;
  source: string | null;
  page_url: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  error: string | null;
  created_at: string;
  thumbs_up: boolean | null;
  has_correction: boolean;
  promoted_to_kb: boolean | null;
  ai_verdict: AiVerdict | null;
  geo_city: string | null;
  geo_state: string | null;
  geo_country: string | null;
  anonymous_id: string | null;
  device: string | null;
  channel: string | null;
}

/** A full turn, for the transcript. */
export interface InboxTurn {
  id: string;
  at: string;
  question: string;
  answer: string | null;
  error: string | null;
  status: TurnStatus;
  thumbsUp: boolean | null;
  correction: string | null;
  correctedByName: string | null;
  correctedAt: string | null;
  promotedToKb: boolean;
  aiReview: AiReview | null;
  model: string | null;
  responseMs: number | null;
  tools: string[];
  pageUrl: string | null;
}

export interface InboxUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string | null;
  firstChannel: string | null;
  /** e.g. "NATA · School student", from the application form. */
  profileLabel: string | null;
  enrolled: boolean;
  demoBooked: boolean;
  applied: boolean;
}

export interface Nudge {
  requestedAt: string;
  requestedByName: string | null;
  shownAt: string | null;
}

export type DayBucket = 'today' | 'yesterday' | 'week' | string; // string = "YYYY-MM"

export interface InboxConversation {
  id: string; // session_id
  personKey: string;
  userId: string | null;
  anonymousId: string | null;
  isGuest: boolean;
  name: string;
  guestTag: string | null;
  initials: string;
  phone: string | null;
  startedAt: string;
  lastAt: string;
  bucket: DayBucket;
  place: string | null;
  stateName: string | null;
  channel: string | null;
  device: string | null;
  source: string | null;
  questions: string[];
  /** Status of each question, same order as questions. */
  turnStatuses: TurnStatus[];
  lastQuestion: string;
  turnCount: number;
  intents: Intent[];
  status: TurnStatus;
  reviewCount: number;
  errorCount: number;
  creditErrorCount: number;
}

export interface InboxPerson {
  key: string;
  userId: string | null;
  anonymousId: string | null;
  isGuest: boolean;
  name: string;
  guestTag: string | null;
  initials: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  profileLabel: string | null;
  joinedAt: string | null;
  place: string | null;
  channel: string | null;
  device: string | null;
  visits: number;
  firstSeen: string;
  lastAt: string;
  lastQuestion: string;
  lastConversationId: string;
  intents: Intent[];
  stage: LeadStage;
  nudge: Nudge | null;
}

export interface InboxPayload {
  conversations: InboxConversation[];
  people: InboxPerson[];
  generatedAt: string;
  /** True when the row cap was hit and the oldest chats are left out. */
  truncated: boolean;
}

/**
 * Payments v2 (migration 20261220090000): one model for every fee payment.
 * Amounts are integer paise. `payments` stays the ledger of record.
 */
export type PaymentIntentPurpose = 'enrolment' | 'installment';
export type PaymentIntentStatus = 'open' | 'paid' | 'expired' | 'cancelled';
export type PaymentScheme = 'full' | 'installment';

export type PaymentAttemptMethod = 'upi_auto' | 'upi_proof' | 'bank_proof' | 'razorpay';
export type PaymentAttemptState =
  | 'created'
  | 'awaiting_credit'
  | 'awaiting_review'
  | 'succeeded'
  | 'rejected'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'disputed'
  | 'reversed';
export type ProofChannel = 'upload' | 'whatsapp';
export type PaymentActorType = 'student' | 'staff' | 'system' | 'webhook' | 'observer';
export type BankCreditSource = 'sms' | 'email' | 'razorpay' | 'statement_import' | 'manual';
export type OutboxStatus = 'pending' | 'processing' | 'done' | 'dead';

/** An attempt in one of these states is "live": the plan cannot change under it. */
export const LIVE_ATTEMPT_STATES: PaymentAttemptState[] = ['awaiting_credit', 'awaiting_review'];

export interface PaymentIntentRow {
  id: string;
  purpose: PaymentIntentPurpose;
  enrollment_link_id: string | null;
  installment_id: string | null;
  lead_profile_id: string | null;
  user_id: string | null;
  scheme: PaymentScheme | null;
  amount_paise: number;
  status: PaymentIntentStatus;
  paid_attempt_id: string | null;
  paid_at: string | null;
  expires_at: string | null;
  allowed_methods: string[];
  legacy_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PaymentAttemptRow {
  id: string;
  intent_id: string;
  method: PaymentAttemptMethod;
  state: PaymentAttemptState;
  amount_paise: number;
  paise_tag: number | null;
  convenience_fee_paise: number;
  provider: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  utr: string | null;
  payer_vpa: string | null;
  payer_name: string | null;
  paid_on_claimed: string | null;
  proof_object_path: string | null;
  proof_channel: ProofChannel | null;
  proof_sha256: string | null;
  matched_credit_id: string | null;
  review_by: string | null;
  review_at: string | null;
  review_decision: 'verify' | 'reject' | null;
  review_note: string | null;
  statement_checked: boolean;
  failure_code: string | null;
  failure_reason: string | null;
  expires_at: string | null;
  idempotency_key: string | null;
  client_ip_hash: string | null;
  client_ua: string | null;
  legacy_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BankCreditEventRow {
  id: string;
  source: BankCreditSource;
  source_ref: string;
  receiving_account: string | null;
  utr: string | null;
  amount_paise: number;
  payer_vpa: string | null;
  payer_name: string | null;
  credited_at: string;
  raw_redacted: string | null;
  signature_ok: boolean | null;
  parser_version: string | null;
  matched_attempt_id: string | null;
  match_kind: 'auto' | 'staff' | 'statement' | null;
  assigned_by: string | null;
  confidence: 'single_channel' | 'two_channel';
  sources: string[];
  ignored_at: string | null;
  ignored_reason: string | null;
  received_at: string;
}

export interface PaymentOutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  job: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  next_run_at: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  done_at: string | null;
}

export interface PaymentEventRow {
  id: string;
  actor_type: PaymentActorType;
  actor_id: string | null;
  action: string;
  intent_id: string | null;
  attempt_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
}

export interface WebhookInboxRow {
  id: string;
  provider: 'razorpay' | 'observer_sms' | 'observer_email' | 'observer_heartbeat';
  event_id: string;
  signature_ok: boolean;
  headers_redacted: Record<string, unknown> | null;
  body: unknown;
  received_at: string;
  processed_at: string | null;
  error: string | null;
}

export interface WatcherHeartbeatRow {
  source: string;
  last_seen_at: string;
  last_event_at: string | null;
  app_version: string | null;
  meta: Record<string, unknown>;
}

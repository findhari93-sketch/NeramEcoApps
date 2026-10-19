import type { DuplicatePair, CandidatePerson, DuplicateRelation } from '@neram/database';

export type { DuplicatePair, CandidatePerson, DuplicateRelation };

/**
 * ready    open pairs that passed every check (merge on their own when the
 *          setting is on, or with one click)
 * review   open pairs a guardrail stopped, waiting for a person
 * auto     merged automatically, with Undo for 30 days
 * history  merged by staff, and pairs marked as different people
 */
export type DuplicateTab = 'ready' | 'review' | 'auto' | 'history';
export const DUPLICATE_TABS: readonly DuplicateTab[] = ['ready', 'review', 'auto', 'history'];

export interface UndoState {
  undoable: boolean;
  undoneAt: string | null;
  mergedAt: string;
  relation: string | null;
}

/** A pair as GET /api/duplicates returns it. */
export type QueuePair = DuplicatePair & { undo: UndoState | null };

export interface TabCounts {
  ready: number;
  review: number;
  auto: number;
}

/** A users row as the merge preview returns it (winner, loser). */
export interface PreviewRow {
  id: string;
  name: string | null;
  email: string | null;
  personal_email?: string | null;
  ms_oid: string | null;
  firebase_uid: string | null;
  google_id?: string | null;
  phone: string | null;
  date_of_birth: string | null;
  academic_year: string | null;
  is_alumni: boolean;
  created_at?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
}

export interface ReferenceCount {
  table: string;
  column: string;
  rows: number;
}

/** GET /api/duplicates/[id] */
export interface DuplicatePreviewResponse {
  candidate: DuplicatePair;
  relation: DuplicateRelation;
  winnerId: string;
  loserId: string;
  preview: {
    winner: PreviewRow;
    loser: PreviewRow;
    afterMerge: Partial<PreviewRow>;
    warnings: string[];
    referenceCounts: ReferenceCount[];
  };
  refused: boolean;
}

/** POST /api/duplicates/bulk-merge */
export interface BulkMergeResponse {
  merged: Array<{ candidateId: string; winnerId: string; loserId: string; logId: string | null }>;
  failed: Array<{ candidateId: string; error: string }>;
}

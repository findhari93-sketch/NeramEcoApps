import type { DuplicatePair, CandidatePerson } from '@neram/database';

export type { DuplicatePair, CandidatePerson };

export type DuplicateTab = 'open' | 'merged' | 'dismissed';
export const DUPLICATE_TABS: readonly DuplicateTab[] = ['open', 'merged', 'dismissed'];

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
  candidate: {
    id: string;
    reason: string;
    confidence: 'strong' | 'likely';
    status: 'open' | 'merged' | 'dismissed';
    detected_at: string;
    note: string | null;
  };
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

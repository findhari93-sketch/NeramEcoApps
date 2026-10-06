/**
 * The AI Tutor's wire shapes: what the panel sends (TutorAction) and what it
 * gets back (TutorEnvelope of TutorBlocks). Pure types, shared by the server
 * and the panel. Nothing here can carry an answer the student has not earned:
 * choices go out without a `correct` flag, and the full solution only as a
 * `solution` block after the reveal rule passes (engine.ts).
 */
import type { ErrorCode } from './pack';

export type Phase = 'diagnose' | 'attempt' | 'guided' | 'reveal' | 'practice_next' | 'done';
export type MasteryState = 'UNKNOWN' | 'INTRODUCED' | 'DEVELOPING' | 'PRACTICING' | 'STRONG' | 'MASTERED';
export type SimilarLevel = 'very_similar' | 'variation' | 'extension' | 'challenge';
export type LearningItemKind = 'formula' | 'concept' | 'explanation' | 'mistake' | 'shortcut' | 'example' | 'diagram' | 'bookmark';

export type TutorAction =
  | { type: 'start' }
  | { type: 'guide_me' }
  | { type: 'try_myself' }
  | { type: 'reader_answered' }
  | { type: 'choose'; stepId: string; choiceId: string }
  | { type: 'answer'; text: string }
  | { type: 'hint' }
  | { type: 'why' }
  | { type: 'show_solution' }
  | { type: 'similar' }
  | { type: 'save'; ref: string }
  | { type: 'skip_check' }
  | { type: 'end' };

export interface Chip {
  label: string;
  action: TutorAction;
}

export interface SimilarItem {
  questionId: string;
  level: SimilarLevel;
  /** The start of the question text (public: no key, no explanation). */
  preview: string;
  difficulty: string | null;
  hasTutor: boolean;
}

export type TutorBlock = { id: string } & (
  | { kind: 'tutor_text'; md: string }
  | {
      kind: 'check_question';
      stepId: string;
      md: string;
      /** Choices without their correct flag. Letters are shown A, B, C in order. */
      choices?: Array<{ id: string; md: string }>;
      /** Choices already tried on this check, shown greyed out. */
      tried?: string[];
      input?: 'number';
    }
  | { kind: 'hint'; level: 1 | 2 | 3 | 4; md: string }
  | { kind: 'verdict'; result: 'correct' | 'not_yet'; md: string; mistake?: ErrorCode; mistakeLabel?: string }
  | { kind: 'step_progress'; index: number; total: number }
  | { kind: 'concept_chips'; items: Array<{ slug: string; label: string; state: MasteryState }> }
  | { kind: 'similar_questions'; items: SimilarItem[] }
  | { kind: 'save_offer'; ref: string; itemKind: LearningItemKind; title: string }
  | { kind: 'solution'; steps: string[]; final_md: string }
);

export interface TutorEnvelope {
  sessionId: string;
  phase: Phase;
  blocks: TutorBlock[];
  chips: Chip[];
  /** True when the model wrote part of this reply (the panel shows the AI status line). */
  llm: boolean;
  /** Steps done and total, for the header. */
  progress: { step: number; total: number } | null;
  hintsUsed: number;
}

/**
 * API contract.
 *
 * POST /api/assistant/tutor/turn
 *   body:  TutorTurnRequest
 *   200:   TutorEnvelope  (budget or model failures are a 200 with a sentence, never 409/500)
 *   401 session ended, 403 not in the pilot / not a student, 404 tutor off or no pack for this question,
 *   409 { error } a test is in progress, 400 bad body.
 *
 * GET    /api/my-learning?kind=<LearningItemKind|important>  -> { items: LearningItem[] }
 * PATCH  /api/my-learning/[id]  body { note?: string|null; important?: boolean } -> { item: LearningItem }
 * DELETE /api/my-learning/[id]  -> { ok: true }
 *
 * GET /api/question-bank/questions/[id] gains `tutor_available: boolean` on its data.
 */
export interface TutorTurnRequest {
  questionId: string;
  action: TutorAction;
  /** A fresh id per press; a resend with the same id is not run twice. */
  clientMessageId: string;
}

export interface LearningItem {
  id: string;
  kind: LearningItemKind;
  title: string;
  body_md: string;
  source_question_id: string | null;
  note: string | null;
  important: boolean;
  created_at: string;
  concepts: Array<{ slug: string; label: string; state: MasteryState }>;
}

/** Labels a chip uses everywhere, so tests and the panel agree. */
export const CHIP = {
  tryMyself: 'Try it myself',
  guideMe: 'Guide me step by step',
  hint: 'Give me a hint',
  nextHint: 'Next hint',
  showSolution: 'Show me the full solution',
  similar: 'Similar question',
  done: 'Done for now',
  skipCheck: 'Skip the check',
  answerInQuestion: 'Answer in the question',
  why: 'Why?',
} as const;

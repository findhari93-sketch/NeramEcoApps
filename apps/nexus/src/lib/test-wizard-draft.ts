/**
 * The unsaved state of a test being built.
 *
 * PURE. No React, no fetch, no storage. The wizard is a four-step machine whose
 * whole promise to the teacher is "nothing is saved until you approve it", so
 * the draft has to be a plain value that can be reduced, serialised and
 * asserted on without a DOM.
 *
 * The one idea worth holding on to: four sources (AI, JSON, question bank,
 * previous-year paper) all converge on ONE `DraftQuestion[]`, which is why
 * step 3 can be a single screen instead of four near-copies. Everything else
 * here exists to protect that convergence.
 *
 * The kind of test is deliberately NOT chosen in this file. A test becomes a
 * class test or a weekly only by where it is placed in step 4, which is what
 * `placementRequests()` at the bottom turns into calls.
 */
import type {
  ImportDifficulty,
  ImportExam,
  ImportOption,
  ProposedTag,
} from './qb-import-schema';

/** Mirrors nexus_qb_questions.question_format, which is wider than the import contract's. */
export type DraftFormat = 'MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED';

export type WizardStep = 'source' | 'generate' | 'review' | 'place';
export type SourceKind = 'ai' | 'json' | 'bank' | 'pyq' | 'blank';

export const WIZARD_STEPS: WizardStep[] = ['source', 'generate', 'review', 'place'];
export const SOURCE_KINDS: SourceKind[] = ['ai', 'json', 'bank', 'pyq', 'blank'];

/** Narrows a `?src=` query value, which is a string an attacker or a typo chooses. */
export function parseSourceKind(raw: string | null): SourceKind | null {
  return SOURCE_KINDS.find((k) => k === raw) ?? null;
}

/** The six-way dedupe vocabulary, borrowed verbatim from ImportReviewCard so the two cannot drift. */
export type DraftRowAction = 'create' | 'reuse' | 'merge' | 'replace' | 'keep_both' | 'skip';

export interface DraftDuplicateCandidate {
  id: string;
  question_text: string;
  similarity: number;
}

/**
 * One question in the draft. A superset of ImportQuestion: the extra fields are
 * what the bank and PYQ branches need in order to arrive at the same shape as a
 * pasted or generated question.
 */
export interface DraftQuestion {
  /**
   * Stable across reorder and edit, unlike ImportQuestion.key which is
   * positional. A positional key means editing question 3 after deleting
   * question 1 writes to the wrong row.
   */
  key: string;
  /** Non-null means this row already exists in nexus_qb_questions and must not be re-authored. */
  bank_question_id: string | null;
  question_text: string;
  question_format: DraftFormat;
  options: ImportOption[] | null;
  correct_answer: string;
  explanation: string | null;
  source_quote: string | null;
  /** "Q7 references an image, attach it in review". Carried so the review step can ask for it. */
  image_ref: string | null;
  difficulty: ImportDifficulty;
  exam_relevance: ImportExam;
  tag_ids: string[];
  tag_slugs: string[];
  new_tag_slugs: string[];
  marks: number;
  negative_marks: number;
  action: DraftRowAction;
  existing_question_id: string | null;
  candidates: DraftDuplicateCandidate[];
}

export interface DraftRules {
  timed: boolean;
  durationMinutes: number;
  marksPerQuestion: number;
  negativeMarks: number;
  /** null is the unlimited case the design writes as "∞ best counts". */
  attempts: 1 | 3 | null;
  passPct: number;
  shuffle: boolean;
}

/**
 * Where the test should live. A checklist, never a type dropdown.
 *
 * Note there is no `kind: 'weekly'` context in nexus_placement_context, and
 * deliberately so: weekly and mock ride on `classroom_assignment` plus a
 * test_kind and a scheduled `available_from`. The genuinely new object is an
 * EMPTY slot ("Week 33, no test yet"), and nothing in this phase needs one.
 */
/**
 * Note there is no "require catch-up checkpoints" choice here yet.
 *
 * The design has that checkbox, and it is real, but nothing on the server can
 * act on it: there is no teacher-facing route that creates a catchup_class
 * placement, and checkpoints themselves are authored on the class video page
 * against its transcript. A checkbox that writes nowhere is worse than an
 * absent one, so it arrives with the video-page work rather than before it.
 */
export type PlacementChoice =
  | { kind: 'class_test'; classId: string; label: string; dueAt: string | null }
  | { kind: 'chapter'; fileId: string; label: string }
  | { kind: 'weekly'; classroomId: string; label: string; availableFrom: string | null }
  | { kind: 'mock'; classroomId: string; label: string; availableFrom: string | null }
  | { kind: 'practice'; classroomId: string; label: string };

export interface PaperSection {
  name: string;
  questionCount: number;
  marks: number;
  negativeMarks: number;
}

export interface PaperBlueprint {
  paperId: string;
  examType: string;
  year: number;
  durationMinutes: number | null;
  sections: PaperSection[];
}

export interface TestDraft {
  v: typeof DRAFT_VERSION;
  draftId: string;
  createdAt: string;
  step: WizardStep;
  source: SourceKind | null;
  title: string;
  folderId: string | null;
  folderPath: string[];

  ai: {
    mode: 'topic' | 'recording' | 'pdf';
    topic: string;
    classId: string | null;
    fileId: string | null;
    steer: string;
    count: number;
    difficulty: 'easy' | 'mixed' | 'hard';
    formats: DraftFormat[];
  };
  json: { raw: string; fileName: string | null; fileSize: number | null };
  bank: { selectedIds: string[]; matchedCount: number | null };
  pyq: { paperId: string | null; mode: 'faithful' | 'questions_only'; blueprint: PaperBlueprint | null };

  questions: DraftQuestion[];
  proposedTags: Array<ProposedTag & { approved: boolean }>;

  rules: DraftRules;
  placements: PlacementChoice[];
  /** A verified previous-year paper is already reviewed, so step 3 is skipped. */
  skipReview: boolean;
}

export const DRAFT_VERSION = 1 as const;
export const DRAFT_STORAGE_KEY = 'nexus.test-wizard.draft.v1';
/** Long enough to survive lunch, short enough that last week's draft cannot be published by accident. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RULES: DraftRules = {
  timed: false,
  durationMinutes: 30,
  marksPerQuestion: 1,
  negativeMarks: 0,
  attempts: null,
  passPct: 60,
  shuffle: true,
};

export function emptyDraft(draftId: string, createdAt: string): TestDraft {
  return {
    v: DRAFT_VERSION,
    draftId,
    createdAt,
    step: 'source',
    source: null,
    title: '',
    folderId: null,
    folderPath: [],
    ai: {
      mode: 'topic',
      topic: '',
      classId: null,
      fileId: null,
      steer: '',
      count: 15,
      difficulty: 'mixed',
      formats: ['MCQ', 'NUMERICAL'],
    },
    json: { raw: '', fileName: null, fileSize: null },
    bank: { selectedIds: [], matchedCount: null },
    pyq: { paperId: null, mode: 'faithful', blueprint: null },
    questions: [],
    proposedTags: [],
    rules: { ...DEFAULT_RULES },
    placements: [],
    skipReview: false,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type DraftAction =
  | { type: 'reset'; draftId: string; createdAt: string }
  | { type: 'hydrate'; draft: TestDraft }
  | { type: 'goStep'; step: WizardStep }
  | { type: 'pickSource'; source: SourceKind }
  | { type: 'patchAi'; patch: Partial<TestDraft['ai']> }
  | { type: 'patchJson'; patch: Partial<TestDraft['json']> }
  | { type: 'patchBank'; patch: Partial<TestDraft['bank']> }
  | { type: 'patchPyq'; patch: Partial<TestDraft['pyq']> }
  | { type: 'patchRules'; patch: Partial<DraftRules> }
  | { type: 'setTitle'; title: string }
  | { type: 'setFolder'; folderId: string | null; folderPath: string[] }
  | { type: 'setPlacements'; placements: PlacementChoice[] }
  | { type: 'setProposedTags'; tags: Array<ProposedTag & { approved: boolean }> }
  /** The single convergence point. Every source branch ends here. */
  | { type: 'questionsReady'; questions: DraftQuestion[]; title?: string; folderPath?: string[] }
  | { type: 'updateQuestion'; key: string; patch: Partial<DraftQuestion> }
  | { type: 'removeQuestion'; key: string }
  | { type: 'setCandidates'; byKey: Record<string, DraftDuplicateCandidate[]> };

export function draftReducer(state: TestDraft, action: DraftAction): TestDraft {
  switch (action.type) {
    case 'reset':
      return emptyDraft(action.draftId, action.createdAt);

    case 'hydrate':
      return action.draft;

    case 'goStep':
      return { ...state, step: action.step };

    case 'pickSource':
      // Switching source throws away the previous branch's questions on
      // purpose. Carrying 15 generated questions into the bank branch would
      // silently mix two provenances into one test, and the detail page's
      // "built with Gemini from the 12 Jul transcript" line would then be a
      // half-truth nobody could untangle later.
      //
      // `step` is deliberately NOT set here. The URL owns which step renders;
      // the caller navigates. When both owned it, picking a source and then
      // pressing browser Back landed on an empty review screen, because the
      // reducer still believed it was past step 2.
      return {
        ...state,
        source: action.source,
        questions: state.source === action.source ? state.questions : [],
        proposedTags: state.source === action.source ? state.proposedTags : [],
        skipReview: false,
      };

    case 'patchAi':
      return { ...state, ai: { ...state.ai, ...action.patch } };

    case 'patchJson':
      return { ...state, json: { ...state.json, ...action.patch } };

    case 'patchBank':
      return { ...state, bank: { ...state.bank, ...action.patch } };

    case 'patchPyq': {
      const pyq = { ...state.pyq, ...action.patch };
      // A verified paper skips review; "questions only" turns it into editable
      // raw material and therefore does not.
      return { ...state, pyq, skipReview: pyq.mode === 'faithful' && Boolean(pyq.paperId) };
    }

    case 'patchRules':
      return { ...state, rules: { ...state.rules, ...action.patch } };

    case 'setTitle':
      return { ...state, title: action.title };

    case 'setFolder':
      return { ...state, folderId: action.folderId, folderPath: action.folderPath };

    case 'setPlacements':
      return { ...state, placements: action.placements };

    case 'setProposedTags':
      return { ...state, proposedTags: action.tags };

    case 'questionsReady':
      return {
        ...state,
        questions: action.questions,
        // The AI and JSON branches read a title off the reply. It only fills a
        // blank, never overwrites something the teacher typed.
        title: state.title.trim() ? state.title : (action.title || '').trim(),
        folderPath: state.folderPath.length ? state.folderPath : action.folderPath || [],
      };

    case 'updateQuestion':
      return {
        ...state,
        questions: state.questions.map((q) => (q.key === action.key ? { ...q, ...action.patch } : q)),
      };

    case 'removeQuestion':
      return { ...state, questions: state.questions.filter((q) => q.key !== action.key) };

    case 'setCandidates':
      return {
        ...state,
        questions: state.questions.map((q) =>
          action.byKey[q.key] ? { ...q, candidates: action.byKey[q.key] } : q,
        ),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

/** The next step, honouring the verified-paper skip. Null when there is nowhere to go. */
export function nextStep(draft: TestDraft): WizardStep | null {
  switch (draft.step) {
    case 'source':
      return draft.source ? (draft.source === 'blank' ? 'review' : 'generate') : null;
    case 'generate':
      return draft.skipReview ? 'place' : 'review';
    case 'review':
      return 'place';
    default:
      return null;
  }
}

export function prevStep(draft: TestDraft): WizardStep | null {
  switch (draft.step) {
    case 'place':
      return draft.skipReview ? 'generate' : 'review';
    case 'review':
      return draft.source === 'blank' ? 'source' : 'generate';
    case 'generate':
      return 'source';
    default:
      return null;
  }
}

/**
 * Whether a step can be rendered at all.
 *
 * This is what stops `?step=review` on a fresh load from painting an empty
 * review screen. An unreachable step falls back to the furthest reachable one.
 */
export function canEnterStep(draft: TestDraft, step: WizardStep): boolean {
  switch (step) {
    case 'source':
      return true;
    case 'generate':
      return draft.source !== null && draft.source !== 'blank';
    case 'review':
      // Questions, not merely a source. Without this, picking a source made
      // review reachable and a stale URL could paint "0 questions · 0 marks".
      return draft.source === 'blank' || (draft.questions.length > 0 && !draft.skipReview);
    case 'place':
      return draft.questions.length > 0 || draft.skipReview;
    default:
      return false;
  }
}

/**
 * Which step the URL is asking for, corrected to one the draft can support.
 *
 * No `?step` means the wizard's entry URL, which is always step 1. That is what
 * makes browser Back work: each step is pushed as its own history entry, so
 * popping back to the entry URL has to mean step 1 and nothing else.
 */
export function resolveStep(draft: TestDraft, requested: string | null): WizardStep {
  if (!requested) return 'source';
  const wanted = WIZARD_STEPS.find((s) => s === requested);
  if (wanted && canEnterStep(draft, wanted)) return wanted;
  // Furthest reachable, so a stale link lands somewhere useful rather than
  // bouncing the teacher back to step 1 with their work still in memory.
  for (let i = WIZARD_STEPS.length - 1; i >= 0; i -= 1) {
    if (canEnterStep(draft, WIZARD_STEPS[i])) return WIZARD_STEPS[i];
  }
  return 'source';
}

// ---------------------------------------------------------------------------
// Derived facts
// ---------------------------------------------------------------------------

/** Rows that will actually end up in the test. `skip` is a decision, not a deletion. */
export function activeQuestions(draft: TestDraft): DraftQuestion[] {
  return draft.questions.filter((q) => q.action !== 'skip');
}

export function totalMarks(draft: TestDraft): number {
  return activeQuestions(draft).reduce((sum, q) => sum + (q.marks || 0), 0);
}

/**
 * Rough sitting time, for the selection tray's "~18 min".
 *
 * Deliberately coarse. It exists to stop a teacher overshooting a 90-minute
 * slot by 40 questions, not to predict any individual student.
 */
export function estimatedMinutes(draft: TestDraft): number {
  const perFormat: Record<DraftFormat, number> = {
    MCQ: 1.2,
    NUMERICAL: 2,
    IMAGE_BASED: 1.5,
    DRAWING_PROMPT: 12,
  };
  const mins = activeQuestions(draft).reduce((sum, q) => sum + (perFormat[q.question_format] ?? 1.2), 0);
  return Math.max(1, Math.round(mins));
}

export function isPublishable(draft: TestDraft): boolean {
  if (!draft.title.trim()) return false;
  if (draft.skipReview) return Boolean(draft.pyq.paperId);
  return activeQuestions(draft).length > 0;
}

// ---------------------------------------------------------------------------
// Placement routing
// ---------------------------------------------------------------------------

/**
 * One call the publish step has to make for a checked placement row.
 *
 * `via` matters more than it looks. A class test MUST go through the timetable
 * route, because that route is the only one that writes `gating.due_at` and
 * `gating.required`, and the catch-up reader treats a missing `required` as
 * true. Placing a class test through the generic placements route produces a
 * test with no deadline that reads as required forever.
 */
export type PlacementRequest =
  | { via: 'class-test'; classId: string; body: Record<string, unknown> }
  | { via: 'placements'; body: Record<string, unknown> };

export function placementRequests(draft: TestDraft): PlacementRequest[] {
  const out: PlacementRequest[] = [];
  const passing = draft.rules.passPct;
  // Attempts have no column of their own, and want none: the placement is the
  // right home for the same reason passing_pct is, because one paper is a
  // single-attempt class test and an unlimited practice paper at the same time.
  //
  // The key is `attempt_limit` because startOrResumeAttempt already reads
  // exactly that and throws ATTEMPT_LIMIT_REACHED. Writing anything else here
  // would put a cap on screen that nothing enforces.
  const gating = draft.rules.attempts === null ? {} : { attempt_limit: draft.rules.attempts };

  for (const p of draft.placements) {
    switch (p.kind) {
      case 'class_test':
        out.push({
          via: 'class-test',
          classId: p.classId,
          body: { passing_pct: passing, due_at: p.dueAt, required: true, gating },
        });
        break;

      case 'chapter':
        out.push({
          via: 'placements',
          body: { context_type: 'study_file', context_id: p.fileId, passing_pct: passing, gating },
        });
        break;

      case 'weekly':
      case 'mock':
        out.push({
          via: 'placements',
          body: {
            context_type: 'classroom_assignment',
            context_id: p.classroomId,
            passing_pct: passing,
            available_from: p.availableFrom,
            gating,
          },
        });
        break;

      case 'practice':
        out.push({
          via: 'placements',
          body: { context_type: 'student_practice', context_id: p.classroomId, gating },
        });
        break;
    }
  }
  return out;
}

/**
 * The test_kind the placements imply.
 *
 * This is the whole "the kind is decided by where it lives" idea in one
 * function. Ordered most specific first, because a paper that is both a class
 * test and a mock is a class test that happens to sit on the mocks shelf.
 */
export function inferTestKind(draft: TestDraft): string {
  const kinds = new Set(draft.placements.map((p) => p.kind));
  if (draft.pyq.paperId && draft.pyq.mode === 'faithful') return 'full';
  if (kinds.has('class_test')) return 'classroom_assigned';
  if (kinds.has('chapter')) return 'chapter';
  if (kinds.has('weekly')) return 'weekly';
  if (kinds.has('mock')) return 'mock';
  if (kinds.has('practice')) return 'practice_pool';
  return 'classroom_assigned';
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Progressively smaller versions of the draft, biggest first.
 *
 * sessionStorage is about 5 MB and a 200-question paste is around 500 KB of raw
 * JSON on its own, so a full draft can genuinely fail to fit. Shedding order is
 * chosen by what is cheapest to lose: the raw paste has already been parsed
 * into questions, and dedupe candidates can be fetched again. The questions
 * themselves are never shed, because they are the thing worth keeping.
 *
 * Returned rather than written so the order is testable without a browser.
 */
export function draftShedLevels(draft: TestDraft): TestDraft[] {
  const withoutRaw: TestDraft = { ...draft, json: { ...draft.json, raw: '' } };
  const withoutCandidates: TestDraft = {
    ...withoutRaw,
    questions: withoutRaw.questions.map((q) => ({ ...q, candidates: [] })),
  };
  return [draft, withoutRaw, withoutCandidates];
}

/** Null for anything we should not resume: wrong version, unparseable, or stale. */
export function deserialiseDraft(raw: string | null, now: number): TestDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const draft = parsed as TestDraft;
  if (draft.v !== DRAFT_VERSION) return null;
  if (!Array.isArray(draft.questions)) return null;
  const created = Date.parse(draft.createdAt);
  if (!Number.isFinite(created) || now - created > DRAFT_MAX_AGE_MS) return null;
  return draft;
}

/** Worth offering to resume. An untouched draft is noise, not work. */
export function isResumable(draft: TestDraft): boolean {
  return draft.questions.length > 0 || draft.json.raw.length > 0 || draft.bank.selectedIds.length > 0;
}

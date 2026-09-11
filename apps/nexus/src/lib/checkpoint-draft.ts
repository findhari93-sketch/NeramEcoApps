/**
 * The checkpoint editor's working copy of one recording's checkpoints.
 *
 * WHY A CLIENT KEY. Saving a draft deletes and re-inserts every checkpoint, so a
 * save hands back new ids for all of them. The editor has to adopt those ids
 * (keeping the old ones would make the next save archive the live rows), and it
 * cannot use the id to remember which checkpoint is open. Each checkpoint gets a
 * key of its own instead, and selection survives a save by position.
 *
 * WHY A SNAPSHOT. "Unsaved changes" is the working copy compared with what was
 * last loaded, not a flag set on every keystroke, so typing a title and then
 * putting it back reads as saved again and the leave guard stays quiet.
 *
 * Checkpoints are sorted by start time when loaded and when saved, never while a
 * teacher is typing a time, so a card does not jump away mid-edit.
 *
 * Pure TypeScript, no JSX.
 */

import {
  emptyQuestion,
  toEditableSections,
  type EditableQuestion,
  type EditableSection,
} from './recap-sections';

export interface DraftSection extends EditableSection {
  /** Stable for the life of the page, unlike the id, which a save can replace. */
  key: string;
}

export interface CheckpointDraftState {
  sections: DraftSection[];
  /** JSON of the checkpoints as last loaded or saved. */
  savedSnapshot: string;
  selectedKey: string | null;
  nextKey: number;
}

export type DraftAction =
  | { type: 'load'; sections: unknown[] }
  | { type: 'restore'; sections: unknown[] }
  | { type: 'select'; key: string | null }
  | { type: 'patchSection'; key: string; patch: Partial<EditableSection> }
  | { type: 'addSection'; durationSeconds?: number | null }
  | { type: 'removeSection'; key: string }
  | { type: 'addQuestion'; key: string }
  | { type: 'patchQuestion'; key: string; index: number; patch: Partial<EditableQuestion> }
  | { type: 'removeQuestion'; key: string; index: number }
  | { type: 'restoreQuestion'; key: string; index: number; question: EditableQuestion };

/** A new checkpoint's length: five minutes, or up to the end of the video. */
export const NEW_CHECKPOINT_SECONDS = 300;

export function initialDraft(): CheckpointDraftState {
  return { sections: [], savedSnapshot: '[]', selectedKey: null, nextKey: 1 };
}

const strip = (sections: DraftSection[]): EditableSection[] =>
  sections.map(({ key: _key, ...rest }) => rest);

const snapshotOf = (sections: EditableSection[]) => JSON.stringify(sections);

function byStart<T extends EditableSection>(list: T[]): T[] {
  return [...list].sort((a, b) => a.start_timestamp_seconds - b.start_timestamp_seconds);
}

function withKeys(sections: EditableSection[], nextKey: number) {
  let n = nextKey;
  const keyed = sections.map((section) => ({ ...section, key: `k${n++}` }));
  return { keyed, nextKey: n };
}

function mapSection(
  state: CheckpointDraftState,
  key: string,
  change: (section: DraftSection) => DraftSection,
): CheckpointDraftState {
  return { ...state, sections: state.sections.map((s) => (s.key === key ? change(s) : s)) };
}

export function draftReducer(state: CheckpointDraftState, action: DraftAction): CheckpointDraftState {
  switch (action.type) {
    case 'load': {
      // Keep the same checkpoint open across a save, by position.
      const selectedIndex = state.selectedKey
        ? state.sections.findIndex((s) => s.key === state.selectedKey)
        : -1;
      // Through toEditableSections, never by hand: it is what carries the id.
      const sorted = byStart(toEditableSections(action.sections));
      const { keyed, nextKey } = withKeys(sorted, state.nextKey);
      const index = selectedIndex >= 0 ? Math.min(selectedIndex, keyed.length - 1) : 0;
      return {
        sections: keyed,
        savedSnapshot: snapshotOf(sorted),
        selectedKey: keyed[index]?.key ?? null,
        nextKey,
      };
    }

    case 'restore': {
      // A backup of unsaved work. The saved snapshot is left alone, so it stays
      // marked unsaved until the teacher saves it.
      const sorted = byStart(toEditableSections(action.sections));
      const { keyed, nextKey } = withKeys(sorted, state.nextKey);
      return { ...state, sections: keyed, selectedKey: keyed[0]?.key ?? null, nextKey };
    }

    case 'select':
      return { ...state, selectedKey: action.key };

    case 'patchSection':
      return mapSection(state, action.key, (s) => ({ ...s, ...action.patch }));

    case 'addSection': {
      const lastEnd = state.sections.reduce(
        (max, s) => Math.max(max, Number(s.end_timestamp_seconds) || 0),
        0,
      );
      const duration = action.durationSeconds && action.durationSeconds > 0 ? action.durationSeconds : null;
      const start = duration ? Math.min(lastEnd, Math.max(0, duration - 1)) : lastEnd;
      const end = duration ? Math.min(start + NEW_CHECKPOINT_SECONDS, duration) : start + NEW_CHECKPOINT_SECONDS;
      const key = `k${state.nextKey}`;
      const section: DraftSection = {
        key,
        title: `Checkpoint ${state.sections.length + 1}`,
        description: '',
        start_timestamp_seconds: start,
        end_timestamp_seconds: end,
        min_questions_to_pass: null,
        questions: [emptyQuestion()],
      };
      return { ...state, sections: [...state.sections, section], selectedKey: key, nextKey: state.nextKey + 1 };
    }

    case 'removeSection': {
      const index = state.sections.findIndex((s) => s.key === action.key);
      if (index < 0) return state;
      const sections = state.sections.filter((s) => s.key !== action.key);
      const selectedKey =
        state.selectedKey === action.key
          ? sections[Math.min(index, sections.length - 1)]?.key ?? null
          : state.selectedKey;
      return { ...state, sections, selectedKey };
    }

    case 'addQuestion':
      return mapSection(state, action.key, (s) => ({ ...s, questions: [...s.questions, emptyQuestion()] }));

    case 'patchQuestion':
      return mapSection(state, action.key, (s) => ({
        ...s,
        questions: s.questions.map((q, i) => (i === action.index ? { ...q, ...action.patch } : q)),
      }));

    case 'removeQuestion':
      return mapSection(state, action.key, (s) => ({
        ...s,
        questions: s.questions.filter((_, i) => i !== action.index),
      }));

    case 'restoreQuestion':
      return mapSection(state, action.key, (s) => {
        const questions = [...s.questions];
        questions.splice(Math.min(action.index, questions.length), 0, action.question);
        return { ...s, questions };
      });

    default:
      return state;
  }
}

export function isDirty(state: CheckpointDraftState): boolean {
  return snapshotOf(strip(state.sections)) !== state.savedSnapshot;
}

/** What the sections PUT receives: no client keys, ids kept, earliest first. */
export function toSavePayload(state: CheckpointDraftState): EditableSection[] {
  return byStart(strip(state.sections));
}

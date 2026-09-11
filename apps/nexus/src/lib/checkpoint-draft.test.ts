import { describe, it, expect } from 'vitest';
import { draftReducer, initialDraft, isDirty, toSavePayload } from './checkpoint-draft';
import type { EditableQuestion } from './recap-sections';

/**
 * The checkpoint editor's working copy.
 *
 * Two traps shape it. A save of a draft deletes and re-inserts every checkpoint,
 * so every id changes, and an editor that kept the old ids would archive the
 * live rows on its next save. And the old editor swapped the whole page for a
 * loading skeleton on every save, losing the teacher's place. So the working
 * copy keys checkpoints by a client key, adopts whatever ids a save returns, and
 * keeps the same checkpoint selected across it.
 */

const q = (text = 'Why did settlements grow along rivers?'): EditableQuestion => ({
  question_text: text,
  option_a: 'Defence',
  option_b: 'Fertile land',
  option_c: 'Trade winds',
  option_d: 'Mountains',
  correct_option: 'b',
  explanation: '',
});

const row = (id: string, start: number, end: number, over: Record<string, unknown> = {}) => ({
  id,
  title: `Checkpoint ${id}`,
  description: '',
  start_timestamp_seconds: start,
  end_timestamp_seconds: end,
  min_questions_to_pass: null,
  questions: [q()],
  ...over,
});

const loaded = (rows: unknown[] = [row('s2', 924, 1800), row('s1', 0, 924)]) =>
  draftReducer(initialDraft(), { type: 'load', sections: rows });

describe('checkpoint draft', () => {
  it('loads checkpoints in time order, each with its own key, with nothing unsaved', () => {
    const state = loaded();
    expect(state.sections.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(new Set(state.sections.map((s) => s.key)).size).toBe(2);
    expect(isDirty(state)).toBe(false);
    expect(state.selectedKey).toBe(state.sections[0].key);
  });

  it('counts an edit as unsaved, and changing it back as saved again', () => {
    const state = loaded();
    const key = state.sections[0].key;
    const edited = draftReducer(state, { type: 'patchSection', key, patch: { title: 'River valleys' } });
    expect(isDirty(edited)).toBe(true);
    const reverted = draftReducer(edited, { type: 'patchSection', key, patch: { title: 'Checkpoint s1' } });
    expect(isDirty(reverted)).toBe(false);
  });

  it('does not reorder checkpoints while a time is being typed', () => {
    const state = loaded();
    const moved = draftReducer(state, {
      type: 'patchSection',
      key: state.sections[0].key,
      patch: { start_timestamp_seconds: 2000, end_timestamp_seconds: 2100 },
    });
    expect(moved.sections.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('adopts the new ids a save hands back, and keeps the same checkpoint selected', () => {
    const state = loaded();
    const second = draftReducer(state, { type: 'select', key: state.sections[1].key });
    const saved = draftReducer(second, { type: 'load', sections: [row('new-1', 0, 924), row('new-2', 924, 1800)] });
    expect(saved.sections.map((s) => s.id)).toEqual(['new-1', 'new-2']);
    expect(saved.selectedKey).toBe(saved.sections[1].key);
    expect(isDirty(saved)).toBe(false);
  });

  it('adds a checkpoint where the last one ends, with one question to fill in, and selects it', () => {
    const state = draftReducer(loaded(), { type: 'addSection', durationSeconds: 3758 });
    const added = state.sections[2];
    expect(added.start_timestamp_seconds).toBe(1800);
    expect(added.end_timestamp_seconds).toBe(2100);
    expect(added.questions).toHaveLength(1);
    expect(added.id).toBeUndefined();
    expect(state.selectedKey).toBe(added.key);
  });

  it('never adds a checkpoint that runs past the end of the video', () => {
    const state = draftReducer(loaded([row('s1', 0, 3700)]), { type: 'addSection', durationSeconds: 3758 });
    expect(state.sections[1].end_timestamp_seconds).toBe(3758);
  });

  it('selects a neighbour when the selected checkpoint is deleted', () => {
    const state = loaded();
    const removed = draftReducer(state, { type: 'removeSection', key: state.sections[0].key });
    expect(removed.sections.map((s) => s.id)).toEqual(['s2']);
    expect(removed.selectedKey).toBe(removed.sections[0].key);
  });

  it('puts a deleted question back where it was', () => {
    const state = loaded([row('s1', 0, 924, { questions: [q('one'), q('two'), q('three')] })]);
    const key = state.sections[0].key;
    const removed = draftReducer(state, { type: 'removeQuestion', key, index: 1 });
    expect(removed.sections[0].questions.map((x) => x.question_text)).toEqual(['one', 'three']);
    const restored = draftReducer(removed, { type: 'restoreQuestion', key, index: 1, question: q('two') });
    expect(restored.sections[0].questions.map((x) => x.question_text)).toEqual(['one', 'two', 'three']);
  });

  it('changes one question without touching the others', () => {
    const state = loaded([row('s1', 0, 924, { questions: [q('one'), q('two')] })]);
    const key = state.sections[0].key;
    const next = draftReducer(state, { type: 'patchQuestion', key, index: 1, patch: { correct_option: 'd' } });
    expect(next.sections[0].questions[0].correct_option).toBe('b');
    expect(next.sections[0].questions[1].correct_option).toBe('d');
  });

  it('adds a question to the checkpoint it was asked on', () => {
    const state = loaded();
    const next = draftReducer(state, { type: 'addQuestion', key: state.sections[1].key });
    expect(next.sections[1].questions).toHaveLength(2);
    expect(next.sections[0].questions).toHaveLength(1);
  });

  it('restores unsaved work from a backup, and keeps it marked unsaved', () => {
    const state = loaded();
    const restored = draftReducer(state, {
      type: 'restore',
      sections: [row('s1', 0, 900, { title: 'Edited before the tab closed' }), row('s2', 900, 1800)],
    });
    expect(restored.sections[0].title).toBe('Edited before the tab closed');
    expect(isDirty(restored)).toBe(true);
  });

  it('saves without the client keys, keeping ids, in time order', () => {
    const payload = toSavePayload(draftReducer(loaded(), { type: 'addSection', durationSeconds: null }));
    expect(payload.map((s) => s.id)).toEqual(['s1', 's2', undefined]);
    expect(payload.every((s) => !('key' in s))).toBe(true);
  });
});

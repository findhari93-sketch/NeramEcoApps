import { describe, expect, it } from 'vitest';
import { canReveal, helpEvidence, step, type EngineOut, type SessionState } from './engine';
import { tutorMatchers as m } from './matchers';
import type { TutorAction, TutorBlock } from './types';
import { CHIP } from './types';
import { MCQ_PACK, NUM_PACK, facts } from './testing/fixtures';

/** A string as it appears inside JSON, so LaTeX backslashes compare like for like. */
const json = (t: string) => JSON.stringify(t).slice(1, -1);
const kinds = (o: EngineOut) => o.blocks.map((b) => b.kind);
const chipLabels = (o: EngineOut) => o.chips.map((c) => c.label);
const blocksOf = <K extends TutorBlock['kind']>(o: EngineOut, k: K) => o.blocks.filter((b): b is Extract<TutorBlock, { kind: K }> => b.kind === k);

/** Run a list of actions from a fresh session, threading the state. */
function run(actions: TutorAction[], f = facts({ mastery: { 'vector_algebra.components': 'STRONG' } }), pack = MCQ_PACK) {
  let state: SessionState | null = null;
  const outs: EngineOut[] = [];
  for (const a of actions) {
    const out = step(state, pack, a, f, m);
    state = out.state;
    outs.push(out);
  }
  return { state: state!, outs, last: outs[outs.length - 1] };
}

describe('start', () => {
  it('checks a weak prerequisite first, then returns to the question', () => {
    const { outs, state } = run([{ type: 'start' }, { type: 'choose', stepId: 'pre:vector_algebra.components', choiceId: 'p2' }], facts());
    expect(outs[0].state.phase).toBe('diagnose');
    expect(kinds(outs[0])).toEqual(['concept_chips', 'tutor_text', 'check_question']);
    expect(chipLabels(outs[0])).toContain(CHIP.skipCheck);
    expect(outs[1].evidence).toEqual([{ concepts: ['vector_algebra.components'], evidence: 'independent', errorCode: null }]);
    expect(state.phase).toBe('attempt');
    expect(chipLabels(outs[1])).toEqual([CHIP.tryMyself, CHIP.guideMe, CHIP.hint]);
  });

  it('reteaches a missed prerequisite and logs the gap', () => {
    const { last } = run([{ type: 'start' }, { type: 'choose', stepId: 'pre:vector_algebra.components', choiceId: 'p3' }], facts());
    expect(blocksOf(last, 'verdict')[0]).toMatchObject({ result: 'not_yet', mistake: 'PREREQUISITE_GAP' });
    expect(blocksOf(last, 'tutor_text').map((b) => b.md).join()).toMatch(/sign included/);
    expect(last.events.map((e) => e.kind)).toContain('PREREQUISITE_DETECTED');
  });

  it('skips prerequisites the student is strong in or was checked on recently', () => {
    expect(run([{ type: 'start' }]).last.state.phase).toBe('attempt');
    expect(run([{ type: 'start' }], facts({ recentlyChecked: ['vector_algebra.components'] })).last.state.phase).toBe('attempt');
  });

  it('picks up a reader answer given before the tutor opened', () => {
    const { last } = run([{ type: 'start' }], facts({ attempt: { isCorrect: false, selected: 'b' }, mastery: { 'vector_algebra.components': 'STRONG' } }));
    expect(blocksOf(last, 'verdict')[0]).toMatchObject({ mistake: 'SIGN_ERROR' });
    // Guided help starts at the step the mistake belongs to.
    expect(blocksOf(last, 'check_question')[0].stepId).toBe('s2');
  });

  it('resumes where it was', () => {
    const { state } = run([{ type: 'start' }, { type: 'guide_me' }]);
    const out = step(state, MCQ_PACK, { type: 'start' }, facts(), m);
    expect(out.blocks[0]).toMatchObject({ kind: 'tutor_text', md: expect.stringMatching(/Welcome back/) });
    expect(blocksOf(out, 'check_question')[0].stepId).toBe('s1');
  });
});

describe('guided steps', () => {
  it('never sends a correct flag, feedback or a later step', () => {
    const { outs } = run([{ type: 'start' }, { type: 'guide_me' }]);
    const wire = JSON.stringify(outs.map((o) => o.blocks));
    expect(wire).not.toMatch(/"correct"|feedback|mistake"/);
    expect(wire).toContain(json(MCQ_PACK.steps[0].ask));
    expect(wire).not.toContain(json(MCQ_PACK.steps[1].ask));
    expect(wire).not.toContain(json(MCQ_PACK.final.md));
  });

  it('a right choice says what was done well and moves on', () => {
    const { last } = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'choose', stepId: 's1', choiceId: 'c1' }]);
    expect(blocksOf(last, 'verdict')[0]).toMatchObject({ result: 'correct', md: MCQ_PACK.steps[0].on_correct });
    expect(blocksOf(last, 'save_offer')[0]).toMatchObject({ ref: 'formula:s1', itemKind: 'formula' });
    expect(blocksOf(last, 'check_question')[0]).toMatchObject({ stepId: 's2', input: 'number' });
    expect(last.evidence[0]).toMatchObject({ evidence: 'hint_light' });
  });

  it('never repeats an explanation: miss 1 retry, miss 2 the other way, miss 3 worked and moved on', () => {
    const a = { type: 'choose', stepId: 's1', choiceId: 'c2' } as const;
    const b = { type: 'choose', stepId: 's1', choiceId: 'c3' } as const;
    const { outs } = run([{ type: 'start' }, { type: 'guide_me' }, a, b, a]);
    const [, , one, two, three] = outs;
    expect(blocksOf(one, 'tutor_text')[0].md).toBe('Have another look.');
    expect(blocksOf(one, 'check_question')[0].tried).toEqual(['c2']);
    expect(blocksOf(two, 'tutor_text')[0].md).toBe(MCQ_PACK.steps[0].why);
    expect(blocksOf(three, 'tutor_text')[0].md).toMatch(/worked out/);
    expect(blocksOf(three, 'check_question')[0].stepId).toBe('s2');
    // Only the first miss on a step counts against mastery.
    expect(outs.flatMap((o) => o.evidence).filter((e) => e.evidence === 'wrong')).toHaveLength(1);
  });

  it('checks a typed number with the bank grader, any equal form', () => {
    const { last } = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'choose', stepId: 's1', choiceId: 'c1' }, { type: 'answer', text: 'x = -2/2' }]);
    expect(blocksOf(last, 'verdict')[0].result).toBe('correct');
    expect(last.state.guidedDone).toBe(true);
    expect(chipLabels(last)).toEqual([CHIP.answerInQuestion, CHIP.showSolution]);
  });

  it('reads a letter as a choice on the open check', () => {
    const { last } = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'answer', text: 'a' }]);
    expect(blocksOf(last, 'verdict')[0].result).toBe('correct');
  });

  it('a stale check id re-shows where the student is', () => {
    const { last } = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'choose', stepId: 's2', choiceId: 'c1' }]);
    expect(blocksOf(last, 'tutor_text')[0].md).toMatch(/moved on/);
    expect(last.state.stepIndex).toBe(0);
  });
});

describe('hints and reveal', () => {
  it('gives hints one level at a time and allows the solution after the fourth', () => {
    const { outs, state } = run([{ type: 'start' }, { type: 'hint' }, { type: 'hint' }, { type: 'hint' }, { type: 'hint' }, { type: 'hint' }]);
    expect(outs.slice(1, 5).map((o) => blocksOf(o, 'hint')[0].level)).toEqual([1, 2, 3, 4]);
    expect(chipLabels(outs[3])).not.toContain(CHIP.showSolution);
    expect(chipLabels(outs[4])).toContain(CHIP.showSolution);
    expect(blocksOf(outs[5], 'hint')).toHaveLength(0);
    expect(state.hintsUsed).toBe(4);
    expect(canReveal(state)).toBe('hints_exhausted');
  });

  it('refuses the solution before an attempt, all hints, or the guided steps', () => {
    const { last } = run([{ type: 'start' }, { type: 'show_solution' }]);
    expect(kinds(last)).toEqual(['tutor_text']);
    expect(JSON.stringify(last.blocks)).not.toContain(json(MCQ_PACK.final.md));
    expect(last.state.revealed).toBe(false);
  });

  it('"show me the answer" typed is the same gate', () => {
    const { last } = run([{ type: 'start' }, { type: 'answer', text: 'just tell me the answer' }]);
    expect(last.state.revealed).toBe(false);
  });

  it('reveals after a wrong reader answer; the answer itself is the evidence (evidence.ts), not the reveal', () => {
    const f = facts({ mastery: { 'vector_algebra.components': 'STRONG' }, attempt: { isCorrect: false, selected: 'c' } });
    const { last } = run([{ type: 'start' }, { type: 'reader_answered' }, { type: 'show_solution' }], f);
    expect(blocksOf(last, 'solution')[0].final_md).toBe(MCQ_PACK.final.md);
    expect(last.state).toMatchObject({ revealed: true, revealReason: 'attempted', outcome: 'after_reveal', phase: 'practice_next' });
    expect(last.evidence).toEqual([]);
  });
});

describe('reader answers', () => {
  it('an independent right answer ends independent, with no evidence written by the engine', () => {
    const f = facts({ mastery: { 'vector_algebra.components': 'STRONG' }, attempt: { isCorrect: true, selected: 'a' } });
    const { last } = run([{ type: 'start' }, { type: 'try_myself' }, { type: 'reader_answered' }], { ...f, attempt: null } as never);
    expect(last.blocks[0].kind).toBe('tutor_text'); // no attempt yet in these facts
    const after = step(run([{ type: 'start' }, { type: 'try_myself' }]).state, MCQ_PACK, { type: 'reader_answered' }, f, m);
    expect(after.state.outcome).toBe('independent');
    expect(after.evidence).toEqual([]);
    expect(chipLabels(after)).toEqual([CHIP.similar, CHIP.showSolution, CHIP.done]);
  });

  it('a right answer after hints ends with_hints', () => {
    const f = facts({ mastery: { 'vector_algebra.components': 'STRONG' }, attempt: { isCorrect: true, selected: 'a' } });
    const s = run([{ type: 'start' }, { type: 'hint' }, { type: 'hint' }, { type: 'hint' }]).state;
    const out = step(s, MCQ_PACK, { type: 'reader_answered' }, f, m);
    expect(out.state.outcome).toBe('with_hints');
    expect(helpEvidence(out.state)).toBe('hint_heavy');
  });

  it('maps a typed wrong numerical answer to its mistake', () => {
    const f = facts({ questionFormat: 'NUMERICAL', attempt: { isCorrect: false, selected: '25' } });
    const out = step(null, NUM_PACK, { type: 'start' }, f, m);
    expect(blocksOf(out, 'verdict')[0]).toMatchObject({ mistake: 'INCOMPLETE_REASONING' });
    expect(blocksOf(out, 'check_question')[0].stepId).toBe('n2');
    expect(blocksOf(out, 'save_offer')[0].ref).toBe('mistake:0');
  });
});

describe('the model', () => {
  it('is asked only for words the rules cannot place, and its value is checked by the grader', () => {
    const s = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'choose', stepId: 's1', choiceId: 'c1' }]).state;
    const text = 'two minus three which is minus one';
    const first = step(s, MCQ_PACK, { type: 'answer', text }, facts(), m);
    expect(first.needsAi).toEqual({ purpose: 'interpret', text, stepId: 's2' });
    expect(first.blocks).toHaveLength(0);
    // The model says "answer -1, correct"; the grader decides.
    const right = step(s, MCQ_PACK, { type: 'answer', text }, facts({ interpreted: { intent: 'answer', extractedValue: '-1', mistakeCode: null, reply: '' } }), m);
    expect(blocksOf(right, 'verdict')[0].result).toBe('correct');
    const lie = step(s, MCQ_PACK, { type: 'answer', text }, facts({ interpreted: { intent: 'answer', extractedValue: '1', mistakeCode: null, reply: 'Correct!' } }), m);
    expect(blocksOf(lie, 'verdict')[0].result).toBe('not_yet');
  });

  it('a follow-up why after the pack explanation goes to the model; unavailable is said plainly', () => {
    const s = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'why' }]).state;
    const again = step(s, MCQ_PACK, { type: 'why' }, facts(), m);
    expect(again.needsAi?.purpose).toBe('why');
    const off = step(s, MCQ_PACK, { type: 'why' }, facts({ interpreted: { unavailable: 'AI answers are paused right now.' } }), m);
    expect(blocksOf(off, 'tutor_text')[0].md).toBe('AI answers are paused right now.');
  });
});

describe('saving and ending', () => {
  it('saves only what was shown', () => {
    const { last } = run([{ type: 'start' }, { type: 'save', ref: 'solution' }]);
    expect(last.save).toBeUndefined();
    const ok = run([{ type: 'start' }, { type: 'guide_me' }, { type: 'choose', stepId: 's1', choiceId: 'c1' }, { type: 'save', ref: 'formula:s1' }]).last;
    expect(ok.save).toEqual({ ref: 'formula:s1' });
  });

  it('ends a session and marks it abandoned when nothing was solved', () => {
    const { last } = run([{ type: 'start' }, { type: 'end' }]);
    expect(last.state).toMatchObject({ phase: 'done', outcome: 'abandoned' });
    const after = step(last.state, MCQ_PACK, { type: 'hint' }, facts(), m);
    expect(after.state.hintsUsed).toBe(0);
  });

  it('does not mutate the state it was given', () => {
    const s = run([{ type: 'start' }]).state;
    const copy = structuredClone(s);
    step(s, MCQ_PACK, { type: 'hint' }, facts(), m);
    expect(s).toEqual(copy);
  });
});

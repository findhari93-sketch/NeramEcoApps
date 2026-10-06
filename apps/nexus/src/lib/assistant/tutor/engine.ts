/**
 * The AI Tutor's teaching loop, as a pure reducer:
 *
 *   step(state, pack, action, facts, matchers) -> { state, blocks, chips, evidence, events, ... }
 *
 * No database, no model, no clock. The route (api/assistant/tutor/turn)
 * loads the facts, runs this, calls the model only when `needsAi` asks and
 * runs it again with the answer, then writes what comes out.
 *
 * Rules carried from the founder's spec:
 * - One idea per turn; ask, do not lecture (steps are teach + one check).
 * - The full solution only after an attempt, after all 4 hints, or after the
 *   student has worked every guided step (canReveal).
 * - Same explanation twice never: a second miss on a step gets `why`, a third
 *   gets the step worked out and moves on.
 * - After a prerequisite check, return to the original question.
 * - The model never decides right or wrong: matchers.valuesMatch and the
 *   pack's choice flags do.
 */
import { ERROR_LABEL, type ErrorCode, type Matchers, type PackChoice, type PrereqCheck, type TutorPack, type TutorStep } from './pack';
import { classifyReply } from './classify';
import { CHIP, type Chip, type MasteryState, type Phase, type SimilarItem, type TutorAction, type TutorBlock } from './types';

export type Evidence = 'independent' | 'hint_light' | 'hint_heavy' | 'revealed' | 'wrong';

export interface EvidenceEvent {
  concepts: string[];
  evidence: Evidence;
  errorCode: ErrorCode | null;
}

export type LearningEventKind =
  | 'TUTOR_STARTED' | 'PREREQUISITE_CHECKED' | 'PREREQUISITE_DETECTED' | 'CONCEPT_TAUGHT' | 'HINT_REQUESTED'
  | 'ANSWER_CORRECT' | 'ANSWER_WRONG' | 'MISTAKE_DETECTED' | 'REMEDIATION_STARTED'
  | 'SOLUTION_REVEALED' | 'QUESTION_RECOMMENDED' | 'LEARNING_ITEM_SAVED' | 'TUTOR_ENDED';

export interface LearningEvent {
  kind: LearningEventKind;
  concepts: string[];
  errorCode?: ErrorCode | null;
  payload?: Record<string, unknown>;
}

export interface SessionState {
  phase: Phase;
  stepIndex: number;
  hintsUsed: number;
  /** The student has answered the question in the reader. */
  attempted: boolean;
  attemptCorrect: boolean | null;
  /** The student asked to be guided at least once. */
  guided: boolean;
  guidedDone: boolean;
  revealed: boolean;
  revealReason: 'attempted' | 'hints_exhausted' | 'guided_done' | null;
  outcome: 'independent' | 'with_hints' | 'after_reveal' | 'abandoned' | null;
  /** Prerequisite concepts still to check, in order. */
  diagnoseQueue: string[];
  /** Every ref sent to the student: only these may be saved. */
  shown: string[];
  stepWrong: Record<string, number>;
  tried: Record<string, string[]>;
  whyAsked: Record<string, number>;
  mistakes: ErrorCode[];
  /** The last two things the student typed, for the model's context. */
  lastStudent: string[];
}

export type Interpretation =
  | { intent: 'answer' | 'why' | 'confused' | 'off_topic'; extractedValue: string | null; mistakeCode: ErrorCode | null; reply: string }
  | { unavailable: string };

export interface Facts {
  questionFormat: 'MCQ' | 'NUMERICAL';
  /** Mastery by concept slug; a missing slug reads as UNKNOWN. */
  mastery: Record<string, MasteryState>;
  conceptLabels: Record<string, string>;
  /** Prerequisite concepts checked in the last 14 days (not asked again). */
  recentlyChecked: string[];
  /** The student's latest answer to this question in the reader, read from the attempts table. */
  attempt: { isCorrect: boolean; selected: string } | null;
  similar?: SimilarItem[];
  interpreted?: Interpretation;
}

export interface EngineOut {
  state: SessionState;
  blocks: TutorBlock[];
  chips: Chip[];
  evidence: EvidenceEvent[];
  events: LearningEvent[];
  /** The route should ask the model, then call step again with facts.interpreted. */
  needsAi?: { purpose: 'interpret' | 'why'; text: string; stepId: string | null };
  /** The route should write this My Learning item (save.ts builds it from the pack). */
  save?: { ref: string };
}

const BELOW_PRACTICING: ReadonlySet<MasteryState> = new Set(['UNKNOWN', 'INTRODUCED', 'DEVELOPING']);
const LETTERS = 'ABCDE';

export function initialState(): SessionState {
  return {
    phase: 'attempt', stepIndex: 0, hintsUsed: 0, attempted: false, attemptCorrect: null,
    guided: false, guidedDone: false, revealed: false, revealReason: null, outcome: null,
    diagnoseQueue: [], shown: [], stepWrong: {}, tried: {}, whyAsked: {}, mistakes: [], lastStudent: [],
  };
}

/** A state read back from the database: anything missing takes its default. */
export function hydrateState(raw: unknown): SessionState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...(raw as Partial<SessionState>) };
}

/** The reveal rule (D3, extended for the tutor). */
export function canReveal(s: SessionState): SessionState['revealReason'] {
  if (s.attempted) return 'attempted';
  if (s.hintsUsed >= 4) return 'hints_exhausted';
  if (s.guidedDone) return 'guided_done';
  return null;
}

const coreOf = (pack: TutorPack) => pack.concepts.filter((c) => c.role === 'core').map((c) => c.slug);

/** Choices as the student may see them: no correct flag, no feedback. */
const publicChoices = (choices: PackChoice[] | undefined) => (choices || []).map((c) => ({ id: c.id, md: c.md }));

/**
 * Evidence quality of a correct reader answer from how much help the session gave.
 * Used by evidence.ts for practice attempts made while a tutor session is open.
 */
export function helpEvidence(s: Pick<SessionState, 'hintsUsed' | 'guided' | 'revealed'>): Evidence {
  if (s.revealed) return 'revealed';
  if (s.hintsUsed === 0 && !s.guided) return 'independent';
  if (s.hintsUsed <= 2 && !(s.guided && s.hintsUsed > 0)) return 'hint_light';
  return 'hint_heavy';
}

class Out {
  blocks: TutorBlock[] = [];
  chips: Chip[] = [];
  evidence: EvidenceEvent[] = [];
  events: LearningEvent[] = [];
  needsAi?: EngineOut['needsAi'];
  save?: EngineOut['save'];
  private n = 0;
  constructor(public state: SessionState) {}
  block(b: DistributiveOmit<TutorBlock, 'id'>): void {
    this.n += 1;
    this.blocks.push({ id: `b${this.n}`, ...b } as TutorBlock);
  }
  text(md: string): void { this.block({ kind: 'tutor_text', md }); }
  show(ref: string): void { if (!this.state.shown.includes(ref)) this.state.shown.push(ref); }
  chip(label: string, action: TutorAction): void {
    if (!this.chips.some((c) => c.label === label)) this.chips.push({ label, action });
  }
  done(): EngineOut {
    return { state: this.state, blocks: this.blocks, chips: this.chips, evidence: this.evidence, events: this.events, needsAi: this.needsAi, save: this.save };
  }
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

// ── rendering ────────────────────────────────────────────────────────────────

function prereqFor(pack: TutorPack, concept: string): PrereqCheck | undefined {
  return pack.prerequisites.find((p) => p.concept === concept);
}

function renderPrereq(o: Out, pack: TutorPack, facts: Facts): void {
  const p = prereqFor(pack, o.state.diagnoseQueue[0]);
  if (!p) return;
  const label = facts.conceptLabels[p.concept] || 'one idea this question needs';
  o.text(`Before we start, a quick check on **${label}**. It helps me pitch this right.`);
  o.block({ kind: 'check_question', stepId: `pre:${p.concept}`, md: p.ask, choices: publicChoices(p.choices), tried: o.state.tried[`pre:${p.concept}`] });
  o.show(`pre:${p.concept}`);
  o.chip(CHIP.skipCheck, { type: 'skip_check' });
}

function revealChip(o: Out): void {
  if (!o.state.revealed && canReveal(o.state)) o.chip(CHIP.showSolution, { type: 'show_solution' });
}

function menu(o: Out, intro: string | null): void {
  o.state.phase = 'attempt';
  if (intro) o.text(intro);
  o.chip(CHIP.tryMyself, { type: 'try_myself' });
  o.chip(CHIP.guideMe, { type: 'guide_me' });
  if (o.state.hintsUsed < 4) o.chip(o.state.hintsUsed ? CHIP.nextHint : CHIP.hint, { type: 'hint' });
  revealChip(o);
}

function renderStep(o: Out, pack: TutorPack): void {
  const step = pack.steps[o.state.stepIndex];
  o.state.phase = 'guided';
  o.block({ kind: 'step_progress', index: o.state.stepIndex + 1, total: pack.steps.length });
  o.text(step.teach);
  o.block(step.answer_kind === 'choice'
    ? { kind: 'check_question', stepId: step.id, md: step.ask, choices: publicChoices(step.choices), tried: o.state.tried[step.id] }
    : { kind: 'check_question', stepId: step.id, md: step.ask, input: 'number' });
  o.show(`step:${step.id}`);
  o.events.push({ kind: 'CONCEPT_TAUGHT', concepts: [step.concept], payload: { step: step.id } });
  o.chip(CHIP.why, { type: 'why' });
  if (o.state.hintsUsed < 4) o.chip(o.state.hintsUsed ? CHIP.nextHint : CHIP.hint, { type: 'hint' });
  revealChip(o);
}

function practiceMenu(o: Out): void {
  o.state.phase = 'practice_next';
  o.chip(CHIP.similar, { type: 'similar' });
  revealChip(o);
  o.chip(CHIP.done, { type: 'end' });
}

/** Where the student is, said again (resume, or a check that moved on). */
function renderPosition(o: Out, pack: TutorPack, facts: Facts): void {
  const s = o.state;
  if (s.phase === 'diagnose' && s.diagnoseQueue.length) return renderPrereq(o, pack, facts);
  if (s.phase === 'guided' && s.stepIndex < pack.steps.length) return renderStep(o, pack);
  if (s.phase === 'practice_next' || s.phase === 'reveal') return practiceMenu(o);
  menu(o, 'How do you want to work on this one?');
}

// ── transitions ──────────────────────────────────────────────────────────────

function finishDiagnose(o: Out, pack: TutorPack, facts: Facts): void {
  o.state.diagnoseQueue.shift();
  if (o.state.diagnoseQueue.length) return renderPrereq(o, pack, facts);
  menu(o, 'Now back to the question. How do you want to work on it?');
}

function answerPrereq(o: Out, pack: TutorPack, facts: Facts, choiceId: string): void {
  const p = prereqFor(pack, o.state.diagnoseQueue[0]);
  if (!p) return finishDiagnose(o, pack, facts);
  const choice = p.choices.find((c) => c.id === choiceId);
  if (!choice) return renderPosition(o, pack, facts);
  // Read back by the route so the same check is not asked again within 14 days.
  o.events.push({ kind: 'PREREQUISITE_CHECKED', concepts: [p.concept], payload: { correct: choice.correct } });
  if (choice.correct) {
    o.block({ kind: 'verdict', result: 'correct', md: 'Right, you have that.' });
    o.evidence.push({ concepts: [p.concept], evidence: 'independent', errorCode: null });
  } else {
    o.block({ kind: 'verdict', result: 'not_yet', md: choice.feedback || 'Not quite.', mistake: 'PREREQUISITE_GAP', mistakeLabel: ERROR_LABEL.PREREQUISITE_GAP });
    o.text(p.teach);
    o.show(`preteach:${p.concept}`);
    o.evidence.push({ concepts: [p.concept], evidence: 'wrong', errorCode: 'PREREQUISITE_GAP' });
    o.events.push({ kind: 'PREREQUISITE_DETECTED', concepts: [p.concept], errorCode: 'PREREQUISITE_GAP' });
    o.state.mistakes.push('PREREQUISITE_GAP');
  }
  finishDiagnose(o, pack, facts);
}

function advance(o: Out, pack: TutorPack): void {
  o.state.stepIndex += 1;
  if (o.state.stepIndex < pack.steps.length) return renderStep(o, pack);
  o.state.guidedDone = true;
  if (o.state.attemptCorrect) {
    o.text('That is the whole method.');
    return practiceMenu(o);
  }
  o.state.phase = 'attempt';
  o.text('You have worked through every step. Now choose the answer in the question.');
  o.chip(CHIP.answerInQuestion, { type: 'try_myself' });
  revealChip(o);
}

function stepCorrect(o: Out, pack: TutorPack, step: TutorStep): void {
  const wrongs = o.state.stepWrong[step.id] || 0;
  o.block({ kind: 'verdict', result: 'correct', md: step.on_correct });
  o.text(step.result_md);
  if (step.formula) {
    o.show(`formula:${step.id}`);
    o.block({ kind: 'save_offer', ref: `formula:${step.id}`, itemKind: 'formula', title: step.formula.title });
  }
  // A guided step is scaffolded, so even a first-try answer is not independent evidence.
  o.evidence.push({ concepts: [step.concept], evidence: wrongs === 0 ? 'hint_light' : 'hint_heavy', errorCode: null });
  advance(o, pack);
}

function stepWrong(o: Out, pack: TutorPack, step: TutorStep, choice: PackChoice | null): void {
  const n = (o.state.stepWrong[step.id] || 0) + 1;
  o.state.stepWrong[step.id] = n;
  if (choice) o.state.tried[step.id] = [...(o.state.tried[step.id] || []), choice.id];
  const code = choice?.mistake ?? null;
  if (code) o.state.mistakes.push(code);
  // Only the first miss on a step counts against mastery: retries are the student learning.
  if (n === 1) o.evidence.push({ concepts: [step.concept], evidence: 'wrong', errorCode: code });
  o.events.push({ kind: 'ANSWER_WRONG', concepts: [step.concept], errorCode: code, payload: { step: step.id, attempt: n } });
  o.block({
    kind: 'verdict', result: 'not_yet', md: choice?.feedback || 'Not quite.',
    ...(code ? { mistake: code, mistakeLabel: ERROR_LABEL[code] } : {}),
  });
  if (n === 1) {
    o.text('Have another look.');
  } else if (n === 2) {
    // Never the same explanation twice: this is the other way of seeing it.
    o.text(step.why);
    o.show(`why:${step.id}`);
  } else {
    o.text(`Here is that step worked out.\n\n${step.result_md}`);
    o.evidence.push({ concepts: [step.concept], evidence: 'revealed', errorCode: null });
    return advance(o, pack);
  }
  o.block(step.answer_kind === 'choice'
    ? { kind: 'check_question', stepId: step.id, md: step.ask, choices: publicChoices(step.choices), tried: o.state.tried[step.id] }
    : { kind: 'check_question', stepId: step.id, md: step.ask, input: 'number' });
  o.chip(CHIP.why, { type: 'why' });
  if (o.state.hintsUsed < 4) o.chip(o.state.hintsUsed ? CHIP.nextHint : CHIP.hint, { type: 'hint' });
  revealChip(o);
}

function answerStepChoice(o: Out, pack: TutorPack, facts: Facts, stepId: string, choiceId: string): void {
  const step = pack.steps[o.state.stepIndex];
  if (!step || step.id !== stepId || step.answer_kind !== 'choice') {
    o.text('That check has moved on. Here is where we are.');
    return renderPosition(o, pack, facts);
  }
  const choice = (step.choices || []).find((c) => c.id === choiceId);
  if (!choice) return renderPosition(o, pack, facts);
  if (choice.correct) stepCorrect(o, pack, step);
  else stepWrong(o, pack, step, choice);
}

function answerStepValue(o: Out, pack: TutorPack, facts: Facts, raw: string, m: Matchers): void {
  const step = pack.steps[o.state.stepIndex];
  if (step.answer_kind === 'number') {
    if (step.expected && m.valuesMatch(raw, step.expected, step.tolerance)) return stepCorrect(o, pack, step);
    return stepWrong(o, pack, step, null);
  }
  // A value typed against a choice check: the choice whose text is that value.
  const match = (step.choices || []).find((c) => m.valuesMatch(raw, c.md.replace(/\$/g, '')));
  if (match) return answerStepChoice(o, pack, facts, step.id, match.id);
  o.text('Pick one of the choices above, or tap a letter.');
  o.block({ kind: 'check_question', stepId: step.id, md: step.ask, choices: publicChoices(step.choices), tried: o.state.tried[step.id] });
}

function startGuided(o: Out, pack: TutorPack, fromIndex: number): void {
  o.state.guided = true;
  o.state.stepIndex = Math.max(0, Math.min(fromIndex, pack.steps.length - 1));
  o.events.push({ kind: 'REMEDIATION_STARTED', concepts: [pack.steps[o.state.stepIndex].concept] });
  renderStep(o, pack);
}

/**
 * The reader's answer, as the attempts table recorded it. Question-level
 * mastery evidence is written by the practice attempt route (evidence.ts),
 * which reads this session's help level, so it is never counted twice here.
 */
function readerAnswered(o: Out, pack: TutorPack, facts: Facts, m: Matchers): void {
  const a = facts.attempt;
  if (!a) {
    o.text('I do not see an answer yet. Check your answer in the question, then come back.');
    o.chip(CHIP.hint, { type: 'hint' });
    o.chip(CHIP.guideMe, { type: 'guide_me' });
    return;
  }
  const s = o.state;
  s.attempted = true;
  s.attemptCorrect = a.isCorrect;
  const core = coreOf(pack);
  if (a.isCorrect) {
    if (!s.outcome) s.outcome = s.hintsUsed === 0 && !s.guided ? 'independent' : 'with_hints';
    o.block({ kind: 'verdict', result: 'correct', md: pack.final.praise });
    o.events.push({ kind: 'ANSWER_CORRECT', concepts: core, payload: { hints: s.hintsUsed, guided: s.guided } });
    o.text('Want to see a similar one?');
    return practiceMenu(o);
  }
  const mi = pack.mistakes.findIndex((mk) => {
    const t = mk.trigger as { option_id?: string; value?: string };
    if (t.option_id) return t.option_id.toLowerCase() === a.selected.trim().toLowerCase();
    return Boolean(t.value) && m.valuesMatch(a.selected, t.value!);
  });
  const mistake = mi >= 0 ? pack.mistakes[mi] : null;
  o.events.push({ kind: 'ANSWER_WRONG', concepts: core, errorCode: mistake?.code ?? null, payload: { selected: a.selected.slice(0, 40) } });
  if (mistake) {
    s.mistakes.push(mistake.code);
    o.events.push({ kind: 'MISTAKE_DETECTED', concepts: core, errorCode: mistake.code });
    o.block({ kind: 'verdict', result: 'not_yet', md: mistake.explain, mistake: mistake.code, mistakeLabel: ERROR_LABEL[mistake.code] });
    o.show(`mistake:${mi}`);
    o.block({ kind: 'save_offer', ref: `mistake:${mi}`, itemKind: 'mistake', title: `My mistake: ${ERROR_LABEL[mistake.code].toLowerCase()}` });
    o.text('Let us fix that step together.');
    return startGuided(o, pack, pack.steps.findIndex((st) => st.id === mistake.step_id));
  }
  o.block({ kind: 'verdict', result: 'not_yet', md: 'Not this time. Let us find where it slipped.' });
  startGuided(o, pack, 0);
}

function giveHint(o: Out, pack: TutorPack): void {
  const s = o.state;
  if (s.hintsUsed >= 4) {
    o.text('That was the last hint. You can see the whole solution now, or go step by step.');
  } else {
    s.hintsUsed += 1;
    const level = s.hintsUsed as 1 | 2 | 3 | 4;
    o.block({ kind: 'hint', level, md: pack.hints[level - 1] });
    o.show(`hint:${level}`);
    o.events.push({ kind: 'HINT_REQUESTED', concepts: coreOf(pack), payload: { level } });
  }
  if (s.phase === 'guided' && s.stepIndex < pack.steps.length) {
    // Keep the open check in view under the hint.
    const step = pack.steps[s.stepIndex];
    o.block(step.answer_kind === 'choice'
      ? { kind: 'check_question', stepId: step.id, md: step.ask, choices: publicChoices(step.choices), tried: s.tried[step.id] }
      : { kind: 'check_question', stepId: step.id, md: step.ask, input: 'number' });
  } else {
    o.chip(CHIP.tryMyself, { type: 'try_myself' });
    if (!s.guided || s.phase !== 'guided') o.chip(CHIP.guideMe, { type: 'guide_me' });
  }
  if (s.hintsUsed < 4) o.chip(CHIP.nextHint, { type: 'hint' });
  revealChip(o);
}

function showSolution(o: Out, pack: TutorPack): void {
  const s = o.state;
  const reason = canReveal(s);
  if (!reason) {
    o.text('I will show the full solution once you have answered the question, used all 4 hints, or worked through the steps with me. Want a hint, or shall we go step by step?');
    o.chip(s.hintsUsed ? CHIP.nextHint : CHIP.hint, { type: 'hint' });
    o.chip(CHIP.guideMe, { type: 'guide_me' });
    o.chip(CHIP.tryMyself, { type: 'try_myself' });
    return;
  }
  s.revealed = true;
  s.revealReason = s.revealReason ?? reason;
  o.block({ kind: 'solution', steps: pack.steps.map((st) => st.result_md), final_md: pack.final.md });
  o.show('solution');
  o.block({ kind: 'save_offer', ref: 'solution', itemKind: 'explanation', title: 'Worked solution' });
  if (!s.attemptCorrect && !s.outcome) s.outcome = 'after_reveal';
  o.events.push({ kind: 'SOLUTION_REVEALED', concepts: coreOf(pack), payload: { reason: s.revealReason } });
  if (!s.attempted) o.text('Now try answering it in the question. Reading a solution is not the same as doing it.');
  practiceMenu(o);
  if (!s.attempted) o.chip(CHIP.answerInQuestion, { type: 'try_myself' });
}

function why(o: Out, pack: TutorPack, facts: Facts, text: string): void {
  const s = o.state;
  const step = s.phase === 'guided' ? pack.steps[s.stepIndex] : null;
  if (!step) {
    o.text('Tap **Guide me step by step** and I will show the reasoning one piece at a time, or ask me in your own words.');
    o.chip(CHIP.guideMe, { type: 'guide_me' });
    return;
  }
  // The route may run this twice (before and after the model), both times from the stored state.
  const asked = (s.whyAsked[step.id] || 0) + 1;
  s.whyAsked[step.id] = asked;
  if (asked === 1) {
    // The pack's own second explanation is free; the model is only for a follow-up "why".
    o.text(step.why);
    o.show(`why:${step.id}`);
    o.block({ kind: 'save_offer', ref: `why:${step.id}`, itemKind: 'explanation', title: 'Why this step works' });
    o.chip(CHIP.why, { type: 'why' });
    return;
  }
  const r = facts.interpreted;
  if (r === undefined) {
    o.needsAi = { purpose: 'why', text: text || 'Why?', stepId: step.id };
    return;
  }
  o.text('unavailable' in r ? r.unavailable : r.reply);
  if (o.state.hintsUsed < 4) o.chip(CHIP.nextHint, { type: 'hint' });
}

function rememberStudent(s: SessionState, text: string): void {
  s.lastStudent = [...s.lastStudent, text.slice(0, 300)].slice(-2);
}

/** The open check's choice count, for reading "b" as the second choice. */
function openChoices(s: SessionState, pack: TutorPack): PackChoice[] {
  if (s.phase === 'diagnose') return prereqFor(pack, s.diagnoseQueue[0])?.choices || [];
  if (s.phase === 'guided') return pack.steps[s.stepIndex]?.choices || [];
  return [];
}

function typed(o: Out, pack: TutorPack, facts: Facts, text: string, m: Matchers): void {
  const s = o.state;
  rememberStudent(s, text);
  const choices = openChoices(s, pack);
  const c = classifyReply(text, choices.length);
  const hasNumberCheck = s.phase === 'guided' && pack.steps[s.stepIndex]?.answer_kind === 'number';
  switch (c.kind) {
    case 'choice': {
      const id = choices[c.index].id;
      if (s.phase === 'diagnose') return answerPrereq(o, pack, facts, id);
      return answerStepChoice(o, pack, facts, pack.steps[s.stepIndex].id, id);
    }
    case 'value':
      if (s.phase === 'guided') return answerStepValue(o, pack, facts, c.raw, m);
      if (s.phase === 'diagnose') {
        const hit = choices.find((ch) => m.valuesMatch(c.raw, ch.md.replace(/\$/g, '')));
        if (hit) return answerPrereq(o, pack, facts, hit.id);
      }
      o.text('Enter your answer in the question itself and check it. I will pick up from there.');
      o.chip(CHIP.tryMyself, { type: 'try_myself' });
      return;
    case 'why': return why(o, pack, facts, text);
    case 'stuck': return giveHint(o, pack);
    case 'show': return showSolution(o, pack);
    case 'skip':
      if (s.phase === 'diagnose') { s.diagnoseQueue = []; return menu(o, 'Fine, straight to the question then.'); }
      break;
    default: break;
  }
  // Only here does the model get a turn: words the rules above cannot place.
  const r = facts.interpreted;
  if (r === undefined) {
    o.needsAi = { purpose: 'interpret', text, stepId: s.phase === 'guided' ? pack.steps[s.stepIndex]?.id ?? null : null };
    return;
  }
  if ('unavailable' in r) {
    o.text(r.unavailable);
    return renderPosition(o, pack, facts);
  }
  if (r.intent === 'answer' && r.extractedValue && (hasNumberCheck || choices.length)) {
    if (s.phase === 'guided') return answerStepValue(o, pack, facts, r.extractedValue, m);
  }
  if (r.intent === 'confused') return giveHint(o, pack);
  if (r.reply) o.text(r.reply);
  if (r.intent === 'why' && s.phase === 'guided') {
    o.chip(CHIP.why, { type: 'why' });
    return;
  }
  renderPosition(o, pack, facts);
}

// ── entry ────────────────────────────────────────────────────────────────────

export function step(prev: SessionState | null, pack: TutorPack, action: TutorAction, facts: Facts, m: Matchers): EngineOut {
  const fresh = prev === null;
  const s = fresh ? initialState() : structuredClone(prev);
  const o = new Out(s);

  if (s.phase === 'done' && action.type !== 'start' && action.type !== 'save' && action.type !== 'similar') {
    o.text('We finished this one. Start again any time.');
    return o.done();
  }

  switch (action.type) {
    case 'start': {
      if (!fresh && s.phase !== 'done') {
        o.text('Welcome back. Here is where we were.');
        renderPosition(o, pack, facts);
        break;
      }
      if (!fresh) Object.assign(s, initialState());
      o.events.push({ kind: 'TUTOR_STARTED', concepts: coreOf(pack) });
      o.block({
        kind: 'concept_chips',
        items: pack.concepts.map((c) => ({ slug: c.slug, label: facts.conceptLabels[c.slug] || c.slug, state: facts.mastery[c.slug] || 'UNKNOWN' })),
      });
      if (facts.attempt) {
        readerAnswered(o, pack, facts, m);
        break;
      }
      s.diagnoseQueue = pack.prerequisites
        .map((p) => p.concept)
        .filter((c) => BELOW_PRACTICING.has(facts.mastery[c] || 'UNKNOWN') && !facts.recentlyChecked.includes(c))
        .slice(0, 2);
      if (s.diagnoseQueue.length) {
        s.phase = 'diagnose';
        renderPrereq(o, pack, facts);
      } else {
        menu(o, 'How do you want to work on this one?');
      }
      break;
    }
    case 'skip_check':
      if (s.phase === 'diagnose') { s.diagnoseQueue = []; menu(o, 'Fine, straight to the question then.'); }
      else renderPosition(o, pack, facts);
      break;
    case 'guide_me':
      if (s.phase === 'guided') renderPosition(o, pack, facts);
      else startGuided(o, pack, s.guidedDone ? 0 : s.stepIndex);
      break;
    case 'try_myself':
      s.phase = 'attempt';
      o.text('Go ahead and answer in the question. When you check your answer, I will see it and pick up from there.');
      if (s.hintsUsed < 4) o.chip(s.hintsUsed ? CHIP.nextHint : CHIP.hint, { type: 'hint' });
      o.chip(CHIP.guideMe, { type: 'guide_me' });
      revealChip(o);
      break;
    case 'reader_answered':
      readerAnswered(o, pack, facts, m);
      break;
    case 'choose':
      if (s.phase === 'diagnose' && action.stepId === `pre:${s.diagnoseQueue[0]}`) answerPrereq(o, pack, facts, action.choiceId);
      else if (s.phase === 'guided') answerStepChoice(o, pack, facts, action.stepId, action.choiceId);
      else { o.text('That check has moved on. Here is where we are.'); renderPosition(o, pack, facts); }
      break;
    case 'answer':
      typed(o, pack, facts, String(action.text || '').slice(0, 500), m);
      break;
    case 'hint':
      giveHint(o, pack);
      break;
    case 'why':
      why(o, pack, facts, 'Why?');
      break;
    case 'show_solution':
      showSolution(o, pack);
      break;
    case 'similar': {
      const items = facts.similar || [];
      if (items.length) {
        o.text(items.some((i) => i.level === 'very_similar')
          ? 'I found one almost like this, and a few that stretch it a little.'
          : 'Here are some that use the same ideas.');
        o.block({ kind: 'similar_questions', items });
        o.events.push({ kind: 'QUESTION_RECOMMENDED', concepts: coreOf(pack), payload: { ids: items.map((i) => i.questionId) } });
      } else {
        o.text('I could not find a close match yet. The next question in this paper is a good one to try.');
      }
      if (s.phase !== 'done') practiceMenu(o);
      break;
    }
    case 'save': {
      const ref = String(action.ref || '');
      if (!s.shown.includes(ref) || !/^(formula|mistake|why|step):[\w-]+$|^solution$/.test(ref)) {
        o.text('I can only save something I have shown you here.');
        break;
      }
      o.save = { ref };
      o.events.push({ kind: 'LEARNING_ITEM_SAVED', concepts: coreOf(pack), payload: { ref } });
      break;
    }
    case 'end':
      s.phase = 'done';
      if (!s.outcome) s.outcome = 'abandoned';
      o.events.push({ kind: 'TUTOR_ENDED', concepts: coreOf(pack), payload: { outcome: s.outcome, hints: s.hintsUsed } });
      o.text(s.attemptCorrect ? 'Good work. Your progress on these ideas is saved.' : 'Your progress is saved. Come back to this one later and try it fresh.');
      break;
    default:
      renderPosition(o, pack, facts);
  }
  return o.done();
}

/** Display letter for choice index i (A, B, C...). */
export const letterOf = (i: number) => LETTERS[i] ?? String(i + 1);

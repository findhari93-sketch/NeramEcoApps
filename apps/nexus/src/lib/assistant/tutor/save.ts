/**
 * Builds a My Learning item from the pack and a ref the student was shown.
 * The student never posts the content: only the ref, which the engine has
 * already checked against `state.shown`. Pure.
 */
import { ERROR_LABEL, type TutorPack } from './pack';
import type { LearningItemKind } from './types';

export interface BuiltItem {
  kind: LearningItemKind;
  title: string;
  body_md: string;
  conceptSlugs: string[];
}

const MAX_BODY = 4000;
const clip = (s: string) => (s.length > MAX_BODY ? `${s.slice(0, MAX_BODY - 1)}…` : s);

/** `questionText` is shown above a saved solution or mistake so it reads on its own later. */
export function buildLearningItem(pack: TutorPack, ref: string, questionText: string | null): BuiltItem | null {
  const core = pack.concepts.filter((c) => c.role === 'core').map((c) => c.slug);
  const q = questionText ? `**Question.** ${questionText.slice(0, 600)}\n\n` : '';
  const [kind, id] = ref.split(':');

  if (ref === 'solution') {
    const steps = pack.steps.map((s, i) => `${i + 1}. ${s.result_md}`).join('\n');
    return { kind: 'explanation', title: 'Worked solution', body_md: clip(`${q}${steps}\n\n${pack.final.md}`), conceptSlugs: core };
  }
  const step = pack.steps.find((s) => s.id === id);
  if (kind === 'formula' && step?.formula) {
    return { kind: 'formula', title: step.formula.title.slice(0, 200), body_md: clip(step.formula.md), conceptSlugs: [step.concept] };
  }
  if (kind === 'why' && step) {
    return { kind: 'explanation', title: 'Why this step works', body_md: clip(`${step.teach}\n\n${step.why}\n\n${step.result_md}`), conceptSlugs: [step.concept] };
  }
  if (kind === 'mistake') {
    const m = pack.mistakes[Number(id)];
    if (!m) return null;
    const fix = pack.steps.find((s) => s.id === m.step_id);
    const body = `${q}**What went wrong.** ${m.explain}${fix ? `\n\n**The right way.** ${fix.result_md}` : ''}`;
    return { kind: 'mistake', title: `My mistake: ${ERROR_LABEL[m.code].toLowerCase()}`, body_md: clip(body), conceptSlugs: fix ? [fix.concept] : core };
  }
  return null;
}

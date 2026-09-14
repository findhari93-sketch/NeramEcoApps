/**
 * Builds the request sent to the model.
 *
 * Two modes, one contract.
 *
 * ANCHORED (an active brief with five graded reference sheets). The model is
 * asked where the sheet falls RELATIVE to the anchors, never for an absolute
 * score. Language models are markedly better at relative comparison than at
 * absolute scoring on subjective work, and the anchors carry the teacher's
 * actual judgement in a way band prose cannot. Anchors go first and the
 * student sheet last: the anchor block is byte-identical for every submission
 * of the same brief type, and implicit prefix caching only rewards a stable
 * prefix, so the one part that changes sits at the end.
 *
 * GENERIC (everything else, which today is every sheet). No reference sheets
 * exist yet, so the model grades against the observable checks and a fixed
 * band scale written for architecture entrance exams. It is a weaker
 * instrument, which is why its drafts carry their own prompt version and why
 * only a HIGH confidence band ever prefills the rubric.
 *
 * Nothing in here may use a dash as punctuation: the model copies the style of
 * its instructions, and the overall comment goes to a student.
 */

import type { GeminiPart } from '@neram/ai';

import { MAX_DRAFT_TAGS, PROMPT_VERSION, type EvalMode } from './schema';

export interface PromptCriterion {
  key: string;
  title: string;
  observableChecks: string[];
  bandDescriptions: Record<string, string>;
}

export interface PromptAnchor {
  band: number;
  base64: string;
  mimeType: string;
  comment: string | null;
}

export interface PromptInput {
  /** Defaults to anchored, the original behaviour. */
  mode?: EvalMode;
  briefTitle: string;
  briefDescription: string | null;
  /** The wording of the specific question, when the submission has one. */
  questionText: string | null;
  criteria: PromptCriterion[];
  /** Ordered by band, ascending. Empty in generic mode. */
  anchors: PromptAnchor[];
  student: { base64: string; mimeType: string };
  /** Tags the model may choose from. Omitted from the prompt when empty. */
  tagLabels?: readonly string[];
}

export { PROMPT_VERSION };

const ANCHORED_SYSTEM_INSTRUCTION = [
  'You are grading architecture entrance-exam drawing sheets for an Indian NATA and JEE Paper 2 coaching centre.',
  'You are not an art critic. You do not write encouragement. You place a sheet against reference sheets the teacher has already graded, and you justify the placement with what is visibly on the paper.',
  'Every claim you make must be something a person could point at. If you cannot see it, do not say it.',
].join(' ');

const GENERIC_SYSTEM_INSTRUCTION = [
  'You are grading architecture entrance-exam drawing sheets for an Indian NATA and JEE Paper 2 coaching centre. The students are 16 and 17 year old architecture aspirants.',
  'You are not an art critic and you do not write encouragement filler. You grade a sheet against concrete observable checks and against what NATA and JEE Paper 2 examiners expect from a drawing answer, and you justify every band with what is visibly on the paper.',
  'Every claim you make must be something a person could point at. If you cannot see it, do not say it.',
].join(' ');

/** The fixed scale for generic mode, where no reference sheets define the bands. */
const GENERIC_BAND_SCALE = [
  'BAND SCALE. Use the same scale for every criterion.',
  '  1: barely attempted, or mostly wrong. Far below what the exam needs.',
  '  2: attempted, with major visible faults a teacher would stop the class to correct.',
  '  3: workable, with several clear faults. Typical of an aspirant part way through the course.',
  '  4: solid, with one or two minor faults. Would score well in the exam.',
  '  5: exam ready on this criterion. Nothing a teacher would correct.',
  'Most sheets are a 2, 3 or 4. Give a 5 only when you cannot point at a single fault for that criterion.',
].join('\n');

function criteriaBlock(criteria: PromptCriterion[]): string {
  const lines: string[] = ['CRITERIA. Judge each one separately.', ''];

  for (const c of criteria) {
    lines.push(`### ${c.key} (${c.title})`);
    lines.push('What to look at:');
    for (const check of c.observableChecks) lines.push(`  * ${check}`);

    const bands = Object.entries(c.bandDescriptions)
      .filter(([, text]) => text && text.trim() && text.trim() !== 'TODO')
      .sort(([a], [b]) => Number(a) - Number(b));

    if (bands.length > 0) {
      lines.push('Bands, in the teacher’s own words:');
      for (const [band, text] of bands) lines.push(`  ${band}: ${text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function annotationRules(): string[] {
  return [
    'ANNOTATIONS.',
    'Each annotation is a rectangle over the STUDENT SHEET, given as [x, y, width, height].',
    'All four numbers are fractions of the student sheet between 0 and 1, with the origin at its top-left corner. x + width must not exceed 1, and y + height must not exceed 1.',
    'Do not use pixels and do not use percentages.',
    'Draw the box tightly around the thing you are talking about, not around the whole sheet.',
    'Use marker "problem" for a fault, "good" for something done well, "guide" for a correction line the student should aim at, and "note" for anything else.',
    'Two or three annotations per criterion is normal. Zero is acceptable when there is genuinely nothing to point at.',
  ];
}

/** The rules both modes share: keys, confidence, the comment and the tags. */
function commonRules(criteria: PromptCriterion[], tagLabels: readonly string[]): string[] {
  const lines = [
    'RULES.',
    `Return exactly these criterionKey values, once each: ${criteria.map((c) => c.key).join(', ')}.`,
    'Do not invent a criterion. Do not omit one.',
    'Set confidence to "high" only when the evidence for the band is plain on the sheet. Set it to "low" when the photograph is blurred, skewed, cropped or badly lit, and say so in flags.',
    '',
    'OVERALL COMMENT.',
    'Write overallComment as 3 to 4 plain sentences addressed directly to the student, a 16 or 17 year old architecture aspirant.',
    'First say what works on this sheet. Then name the single biggest fix. Then say what to try on the next sheet.',
    'Use plain words a teacher could send unchanged. No headings, no lists, no praise that is not tied to something on the sheet, and never use dashes of any kind as punctuation. Use commas and full stops instead.',
  ];

  if (tagLabels.length > 0) {
    lines.push(
      '',
      'TAGS.',
      `Choose 1 to ${MAX_DRAFT_TAGS} tags that describe what this sheet is, ONLY from this list, spelled exactly as written: ${tagLabels.join('; ')}.`,
      'Do not invent a tag. When nothing on the list fits, return an empty list.',
    );
  }

  return lines;
}

function anchoredTaskBlock(criteria: PromptCriterion[], anchorBands: number[], tagLabels: readonly string[]): string {
  return [
    'TASK.',
    '',
    `You have been shown ${anchorBands.length} reference sheets, graded by the teacher at bands ${anchorBands.join(', ')}, followed by ONE student sheet to evaluate. The student sheet is the LAST image.`,
    '',
    'For each criterion:',
    '1. Decide which reference sheet the student sheet most resembles ON THAT CRITERION ALONE. That is closestAnchorBand.',
    '2. Give the student sheet a band. It may differ from closestAnchorBand when the sheet is clearly better or worse than that reference on this criterion.',
    '3. Justify it in one or two sentences citing something visible on the student sheet. Name the object or the region. Do not restate the criterion.',
    '4. Mark the regions that drove your decision.',
    '',
    ...annotationRules(),
    '',
    ...commonRules(criteria, tagLabels),
  ].join('\n');
}

function genericTaskBlock(criteria: PromptCriterion[], tagLabels: readonly string[]): string {
  return [
    'TASK.',
    '',
    'You are shown ONE student sheet to evaluate. There are no reference sheets.',
    '',
    GENERIC_BAND_SCALE,
    '',
    'For each criterion:',
    '1. Go through its checks one by one and decide which ones the sheet meets and which it misses.',
    '2. Give the sheet a band from 1 to 5 using the BAND SCALE, judged as a NATA or JEE Paper 2 examiner would.',
    '3. Justify it in one or two sentences citing something visible on the sheet. Name the object or the region. Do not restate the criterion.',
    '4. Mark the regions that drove your decision.',
    'Leave closestAnchorBand out: there is no reference sheet to compare against.',
    '',
    ...annotationRules(),
    '',
    ...commonRules(criteria, tagLabels),
  ].join('\n');
}

/**
 * Assemble the parts array.
 *
 * Anchored: the stable prefix is system framing, criteria, task, then every
 * anchor image with its label. Only the final two parts vary per submission,
 * and the question text sits with them rather than in the prefix for exactly
 * that reason, even though it reads slightly out of order.
 *
 * Generic: the same text block, then the student sheet. There is no anchor
 * block to cache.
 */
export function buildEvaluationParts(input: PromptInput): GeminiPart[] {
  const mode: EvalMode = input.mode ?? 'anchored';
  const tagLabels = input.tagLabels ?? [];
  const parts: GeminiPart[] = [];

  const task =
    mode === 'generic'
      ? genericTaskBlock(input.criteria, tagLabels)
      : anchoredTaskBlock(input.criteria, input.anchors.map((a) => a.band), tagLabels);

  parts.push({
    text: [
      `BRIEF: ${input.briefTitle}`,
      input.briefDescription ? `\n${input.briefDescription}` : '',
      '\n\n',
      criteriaBlock(input.criteria),
      '\n',
      task,
    ].join(''),
  });

  if (mode === 'anchored') {
    parts.push({ text: '\nREFERENCE SHEETS, already graded by the teacher.\n' });
    for (const anchor of input.anchors) {
      parts.push({
        text: `Reference sheet, band ${anchor.band}.${anchor.comment ? ` Teacher's note: ${anchor.comment}` : ''}`,
      });
      parts.push({ inline_data: { mime_type: anchor.mimeType, data: anchor.base64 } });
    }
  }

  parts.push({
    text: [
      '\nSTUDENT SHEET TO EVALUATE. This is the image your annotation coordinates refer to.',
      input.questionText ? `\nThe question set was: ${input.questionText}` : '',
    ].join(''),
  });
  parts.push({ inline_data: { mime_type: input.student.mimeType, data: input.student.base64 } });

  return parts;
}

export function buildSystemInstruction(mode: EvalMode = 'anchored'): string {
  return mode === 'generic' ? GENERIC_SYSTEM_INSTRUCTION : ANCHORED_SYSTEM_INSTRUCTION;
}

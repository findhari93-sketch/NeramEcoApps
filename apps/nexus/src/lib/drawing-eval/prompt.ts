/**
 * Builds the request sent to the model.
 *
 * Two decisions here carry most of the design.
 *
 * ORDER. Anchors first, student sheet last. The anchor block is byte-identical
 * for every submission of the same brief type, and implicit prefix caching only
 * rewards a stable prefix, so putting the one part that changes at the end is
 * the main cost lever available at our volume. It costs nothing to get right
 * and cannot be retrofitted without invalidating every cached prefix.
 *
 * FRAMING. The model is asked where the sheet falls RELATIVE to the anchors,
 * never for an absolute score. Language models are markedly better at relative
 * comparison than at absolute scoring on subjective work, and the anchors carry
 * the teacher's actual judgement in a way band prose cannot.
 */

import type { GeminiPart } from '@neram/ai';

import { PROMPT_VERSION } from './schema';

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
  briefTitle: string;
  briefDescription: string | null;
  /** The wording of the specific question, when the submission has one. */
  questionText: string | null;
  criteria: PromptCriterion[];
  /** Ordered by band, ascending. */
  anchors: PromptAnchor[];
  student: { base64: string; mimeType: string };
}

export { PROMPT_VERSION };

const SYSTEM_INSTRUCTION = [
  'You are grading architecture entrance-exam drawing sheets for an Indian NATA and JEE Paper 2 coaching centre.',
  'You are not an art critic. You do not write encouragement. You place a sheet against reference sheets the teacher has already graded, and you justify the placement with what is visibly on the paper.',
  'Every claim you make must be something a person could point at. If you cannot see it, do not say it.',
].join(' ');

function criteriaBlock(criteria: PromptCriterion[]): string {
  const lines: string[] = ['CRITERIA. Judge each one separately.', ''];

  for (const c of criteria) {
    lines.push(`### ${c.key} (${c.title})`);
    lines.push('What to look at:');
    for (const check of c.observableChecks) lines.push(`  - ${check}`);

    const bands = Object.entries(c.bandDescriptions)
      .filter(([, text]) => text && text.trim())
      .sort(([a], [b]) => Number(a) - Number(b));

    if (bands.length > 0) {
      lines.push('Bands, in the teacher’s own words:');
      for (const [band, text] of bands) lines.push(`  ${band}: ${text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function taskBlock(criteria: PromptCriterion[], anchorBands: number[]): string {
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
    'ANNOTATIONS.',
    'Each annotation is a rectangle over the STUDENT SHEET, given as [x, y, width, height].',
    'All four numbers are fractions of the student sheet between 0 and 1, with the origin at its top-left corner. x + width must not exceed 1, and y + height must not exceed 1.',
    'Do not use pixels and do not use percentages.',
    'Draw the box tightly around the thing you are talking about, not around the whole sheet.',
    'Use marker "problem" for a fault, "good" for something done well, "guide" for a correction line the student should aim at, and "note" for anything else.',
    'Two or three annotations per criterion is normal. Zero is acceptable when there is genuinely nothing to point at.',
    '',
    'RULES.',
    `Return exactly these criterionKey values, once each: ${criteria.map((c) => c.key).join(', ')}.`,
    'Do not invent a criterion. Do not omit one.',
    'Set confidence to "low" when the photograph is blurred, skewed, cropped or badly lit, and say so in flags.',
    'Write overallComment as two sentences a teacher could send to the student unchanged.',
  ].join('\n');
}

/**
 * Assemble the parts array.
 *
 * The stable prefix is: system framing, criteria, task, then every anchor
 * image with its label. Only the final two parts vary per submission, and the
 * question text sits with them rather than in the prefix for exactly that
 * reason, even though it reads slightly out of order.
 */
export function buildEvaluationParts(input: PromptInput): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const anchorBands = input.anchors.map((a) => a.band);

  parts.push({
    text: [
      `BRIEF TYPE: ${input.briefTitle}`,
      input.briefDescription ? `\n${input.briefDescription}` : '',
      '\n\n',
      criteriaBlock(input.criteria),
      '\n',
      taskBlock(input.criteria, anchorBands),
    ].join(''),
  });

  parts.push({ text: '\nREFERENCE SHEETS, already graded by the teacher.\n' });
  for (const anchor of input.anchors) {
    parts.push({
      text: `Reference sheet, band ${anchor.band}.${anchor.comment ? ` Teacher's note: ${anchor.comment}` : ''}`,
    });
    parts.push({ inline_data: { mime_type: anchor.mimeType, data: anchor.base64 } });
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

export function buildSystemInstruction(): string {
  return SYSTEM_INSTRUCTION;
}

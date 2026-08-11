import type { NexusQBQuestion, NexusQBQuestionOption } from '@neram/database';

/**
 * Which questions are still waiting for a figure, and which slots that means.
 *
 * One module because the answer was being computed in five places and three of
 * them disagreed. The paper header counted questions that merely mention a
 * figure, the bulk grid demanded an image for every MCQ option, and the card
 * border used a third rule again, so a 47-question paper reported "28 need
 * images" while exactly one was actually empty.
 *
 * Everything here is derived from `questionImageSlots`. Add a caller, do not add
 * a predicate.
 */

export type SlotType = 'question' | 'a' | 'b' | 'c' | 'd';

export interface ImageSlot {
  slot: SlotType;
  /** For the slot chip and the focus ring label. */
  label: string;
  /** Do we believe this slot is supposed to hold a picture? */
  expected: boolean;
  filled: boolean;
}

/**
 * A word that means an actual picture.
 *
 * The previous version also matched the bare phrases `given below`, `shown
 * below`, `refer to` and `look at the`. "Select one group from the options
 * given below" is a text MCQ and matched all the same, which is how a question
 * about warm and cool colours ended up in a list of missing figures. A phrase
 * about position is not evidence of a picture; a noun for a picture is.
 *
 * `solid` earns its place from NTA's own wording ("the 3-D problem figure"
 * questions describe a solid), and `drawing` matches the noun only, so "Draw a
 * composition" does not trip it.
 */
const FIGURE_NOUN =
  /\b(figure|figures|diagram|diagrams|picture|pictures|image|images|sketch|sketches|graph|graphs|drawing|drawings|solid|solids)\b/i;

/**
 * An option label carrying no information, so the real option is the picture.
 *
 * NTA figure-answer papers import with either an empty option text or a bare
 * repeat of the letter. Both mean "the answer is the image".
 */
const OPTION_PLACEHOLDER = /^\(?[a-d]\)?[.)]?$/i;

function textMentionsFigure(text: string | null | undefined): boolean {
  return !!text && FIGURE_NOUN.test(text);
}

function optionsOf(question: NexusQBQuestion): NexusQBQuestionOption[] {
  return (question.options as NexusQBQuestionOption[] | null) ?? [];
}

/** Is this option's answer the picture rather than the words? */
function optionMentionsFigure(option: NexusQBQuestionOption): boolean {
  const text = (option.text || '').trim();
  if (!text) return true;
  if (OPTION_PLACEHOLDER.test(text)) return true;
  return FIGURE_NOUN.test(text);
}

function filledOnServer(question: NexusQBQuestion, slot: SlotType): boolean {
  if (slot === 'question') return !!question.question_image_url;
  return !!optionsOf(question).find((o) => o.id === slot)?.image_url;
}

/**
 * Does the wording suggest a picture belongs somewhere on this question?
 *
 * A guess, and named like one. It drives the "Figures" filter and nothing that
 * claims to be a backlog.
 */
export function questionReferencesFigure(question: NexusQBQuestion): boolean {
  if (question.question_format === 'IMAGE_BASED') return true;
  if (textMentionsFigure(question.question_text)) return true;
  if (question.question_format === 'MCQ' && optionsOf(question).some(optionMentionsFigure)) return true;
  return false;
}

/**
 * Does this question need a picture?
 *
 * A teacher's answer always beats the guess. `needs_image` is tri-state on
 * purpose: NULL means nobody has looked, so the guess still applies and keeps
 * improving as the wordlist does, while an explicit true or false is a decision
 * that no regex change can undo.
 */
export function questionNeedsImage(question: NexusQBQuestion): boolean {
  if (question.needs_image != null) return question.needs_image;
  return questionReferencesFigure(question);
}

/**
 * Every image slot on a question, and whether each is wanted and present.
 *
 * `isFilled` lets the paste flow answer from its unsaved buffer instead of the
 * saved row, so the progress bar moves while a teacher works rather than only
 * after Save.
 */
export function questionImageSlots(
  question: NexusQBQuestion,
  isFilled?: (slot: SlotType) => boolean,
): ImageSlot[] {
  const filled = (slot: SlotType) => (isFilled ? isFilled(slot) : filledOnServer(question, slot));
  const ruledOut = question.needs_image === false;
  const ruledIn = question.needs_image === true;

  const slots: ImageSlot[] = [
    {
      slot: 'question',
      label: 'Q Image',
      // The stem's own figure. Judged on the stem's own words, so a question
      // whose *options* are pictures does not also demand one of its own.
      expected:
        !ruledOut &&
        (ruledIn ||
          question.question_format === 'IMAGE_BASED' ||
          textMentionsFigure(question.question_text)),
      filled: filled('question'),
    },
  ];

  if (question.question_format === 'MCQ') {
    for (const option of optionsOf(question)) {
      const slot = option.id as SlotType;
      slots.push({
        slot,
        label: option.id.toUpperCase(),
        // Per option, never "all four". "How many rectangles are in the figure
        // below?" has one figure and the options 16, 14, 13, 12; demanding four
        // option images is what kept it permanently amber.
        expected: !ruledOut && optionMentionsFigure(option),
        filled: filled(slot),
      });
    }
  }

  return slots;
}

/** Is a slot this question is supposed to have still empty? */
export function questionMissingImages(
  question: NexusQBQuestion,
  isFilled?: (slot: SlotType) => boolean,
): boolean {
  return questionImageSlots(question, isFilled).some((s) => s.expected && !s.filled);
}

/**
 * Every wanted slot is filled, and at least one was wanted.
 *
 * A question needing no picture is not "complete", it is not in the race. The
 * progress bar counts only questions that are.
 */
export function questionImagesComplete(
  question: NexusQBQuestion,
  isFilled?: (slot: SlotType) => boolean,
): boolean {
  const slots = questionImageSlots(question, isFilled);
  const wanted = slots.filter((s) => s.expected);
  return wanted.length > 0 && wanted.every((s) => s.filled);
}

/** Some but not all of the wanted slots are filled. Drives the amber border. */
export function questionImagesPartial(
  question: NexusQBQuestion,
  isFilled?: (slot: SlotType) => boolean,
): boolean {
  const wanted = questionImageSlots(question, isFilled).filter((s) => s.expected);
  return wanted.some((s) => s.filled) && wanted.some((s) => !s.filled);
}

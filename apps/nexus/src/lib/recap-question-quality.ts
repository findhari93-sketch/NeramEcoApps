/**
 * Questions about the recording rather than about the class.
 *
 * `QUESTION_INSTRUCTION` used to demand exactly fifteen questions from every
 * fifteen minute segment, and rule 1 requires each to be answerable from its own
 * segment. Segment 0 of a class is greetings and an audio check, so the model
 * did as it was told and wrote fifteen questions about the tutor saying "good
 * evening guys, am I audible": what time of day it was, what the first word was,
 * how many times a phrase occurred. Those were mirrored into the question bank
 * and folded into the class test, where they counted toward the score. One
 * student was failed twice at 84.76% on a paper padded with them.
 *
 * The prompt now permits an empty segment, which is the real fix. This is the
 * backstop for when the model pads anyway, and it is a plain regex rather than a
 * second model call because every AI feature shares one Gemini key: a filter
 * that costs a call would make a busy day worse.
 *
 * Deliberately narrow. The cost of a false positive is a real question deleted
 * from a checkpoint, so every pattern below anchors on the RECORDING as the
 * subject ("the instructor said", "in this segment", "spoken"), never on a bare
 * keyword. "How many times does the vanishing point appear" and "which is drawn
 * first" both survive, and both would not have under a keyword list.
 */

export interface QuestionLike {
  question_text: string;
}

/**
 * Something that speaks: the tutor, or the recording itself. Trivia is almost
 * always phrased around one of these, because there is nothing else in a
 * greetings segment to ask about.
 */
const SPEAKER = '(?:the\\s+)?(?:instructor|tutor|teacher|speaker|lecturer|sir|ma\'?am)';

const TRIVIA_PATTERNS: RegExp[] = [
  // "What time of day did the instructor greet the students?"
  /\bwhat time (?:of day|was it)\b/i,
  // "What was the very first word spoken by the instructor?" The word "word" is
  // what makes this about the tape rather than about the material.
  /\b(?:first|last)\s+(?:\w+\s+)?word(?:s)?\b/i,
  // "How many times did the instructor use the phrase 'Good evening'?"
  new RegExp(`how many times did\\s+${SPEAKER}`, 'i'),
  // Anything asking what was SAID, as opposed to what was taught.
  //
  // "use" is deliberately NOT in this list on its own. "Which construction
  // method did the instructor use to divide a line into equal parts?" is a
  // perfectly good question about the subject, and an earlier draft of this
  // filter deleted it. Only "use" with a word-about-words as its object counts.
  new RegExp(`\\bdid\\s+${SPEAKER}\\s+(?:say|utter|repeat|greet|address)\\b`, 'i'),
  new RegExp(`\\b${SPEAKER}\\s+(?:say|said|utter|uttered)\\b`, 'i'),
  new RegExp(`\\buse[ds]?\\s+(?:the\\s+)?(?:phrase|word|term|expression|greeting)\\b`, 'i'),
  // Greetings, in any of the shapes the model produced.
  /\bgreet(?:ed|ing|ings)?\b/i,
  /\bgood (?:morning|afternoon|evening)\b/i,
  /\bam i audible\b/i,
  // "How many distinct complete phrases were spoken in this segment?"
  /\b(?:spoken|uttered)\b/i,
  /\bphrases?\s+(?:were|was)\b/i,
];

/** Is this a question about the recording rather than about the subject? */
export function isTranscriptTriviaQuestion(q: QuestionLike): boolean {
  const text = (q.question_text || '').trim();
  if (!text) return false;
  return TRIVIA_PATTERNS.some((re) => re.test(text));
}

/**
 * Drop the trivia from one checkpoint's questions.
 *
 * May legitimately return an empty array, and callers must handle that by
 * DROPPING the section rather than persisting it. A checkpoint with no questions
 * can never be passed, and `assertUnlocked` requires every earlier checkpoint to
 * be passed, so an empty one persisted would make the recap uncompletable and
 * the final check behind it unreachable. `isUsableSection` already filters
 * empty sections out before they are written, which is exactly the behaviour
 * this relies on.
 */
export function dropTranscriptTrivia<T extends QuestionLike>(questions: T[]): T[] {
  return questions.filter((q) => !isTranscriptTriviaQuestion(q));
}

import { describe, it, expect } from 'vitest';
import { isTranscriptTriviaQuestion, dropTranscriptTrivia } from './recap-question-quality';

/**
 * The stems below marked "production" are verbatim from the recap generated for
 * "Aptitude: Orthographic Projection and Counting Figures" (3 Aug 2026). Its
 * first checkpoint covered the first thirteen minutes of the class, which is
 * greetings and an audio check, and the prompt demanded exactly fifteen
 * questions from it. All fifteen went into the class test, where they counted
 * toward the 90 correct answers it needed.
 *
 * The prompt now allows an empty segment. This filter is the backstop for when
 * the model pads anyway, and the reason it is a plain regex rather than a second
 * model call is that there is one shared Gemini key across every AI feature.
 */

const q = (question_text: string) => ({
  question_text,
  option_a: 'a',
  option_b: 'b',
  option_c: 'c',
  option_d: 'd',
  correct_option: 'a',
  explanation: 'because',
});

describe('isTranscriptTriviaQuestion', () => {
  const rejected = [
    'What time of day did the instructor greet the students?',
    'To whom did the instructor first address a greeting?',
    'What was the very first word spoken by the instructor in this segment?',
    'What was the last word spoken by the instructor in this segment?',
    "How many times did the instructor use the phrase 'Good evening' in this segment?",
    'Which term did the instructor use to refer to a group of participants in the second greeting?',
    'Which word was used to address the participants in the first greeting?',
    'How many distinct complete phrases were spoken by the instructor in this segment?',
  ];

  it.each(rejected)('rejects the production stem: %s', (text) => {
    expect(isTranscriptTriviaQuestion(q(text))).toBe(true);
  });

  const kept = [
    'When drawing a 3D geometry with hidden edges, how should the line weights differ?',
    'In an orthographic projection, which view is placed directly below the front view?',
    'How many squares of any size are there in a 3x3 grid?',
    // Says "instructor" but asks about the subject, which is the case a lazy
    // keyword filter would take with it.
    'Which construction method did the instructor use to divide a line into equal parts?',
    // "First" and "last" are ordinary words about content, not about the tape.
    'Which is drawn first when constructing a two-point perspective?',
    'What is the last step in completing an isometric view?',
    // A legitimate counting question that happens to say "how many times".
    'How many times does the vanishing point appear in a two-point perspective drawing?',
  ];

  it.each(kept)('keeps the real question: %s', (text) => {
    expect(isTranscriptTriviaQuestion(q(text))).toBe(false);
  });
});

describe('dropTranscriptTrivia', () => {
  it('strips the padding and leaves the teaching', () => {
    const out = dropTranscriptTrivia([
      q('What was the very first word spoken by the instructor?'),
      q('In an orthographic projection, which view sits below the front view?'),
      q("How many times did the tutor say 'Good evening'?"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].question_text).toContain('orthographic');
  });

  it('can empty a segment completely, which is the point', () => {
    // A greetings-only checkpoint should yield nothing. isUsableSection then
    // drops the section rather than persisting an unpassable one.
    expect(
      dropTranscriptTrivia([
        q('What time of day did the instructor greet the students?'),
        q('To whom did the instructor first address a greeting?'),
      ]),
    ).toEqual([]);
  });

  it('leaves an ordinary set untouched', () => {
    const good = [q('Which line weight shows a hidden edge?'), q('What is an isometric axis?')];
    expect(dropTranscriptTrivia(good)).toHaveLength(2);
  });
});

/**
 * The tutor's maths check: the same parser and comparison the question bank
 * grades typed answers with, so the tutor and the reader never disagree.
 */
import { mathAnswersMatch, parseMathAnswer } from '@neram/database';
import type { Matchers } from './pack';

export const tutorMatchers: Matchers = {
  valuesMatch(student, key, tolerance) {
    const a = parseMathAnswer(student);
    const b = parseMathAnswer(key);
    return Boolean(a && b && mathAnswersMatch(a, b, tolerance));
  },
};

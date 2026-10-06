/**
 * Test fixtures for the tutor: one MCQ pack and one numerical pack that pass
 * verifyPack, and the questions they belong to.
 */
import type { PackQuestion, TutorPack } from '../pack';
import type { Facts } from '../engine';

export const MCQ_QUESTION: PackQuestion = {
  question_format: 'MCQ',
  question_text: 'If $\\vec a = 2\\hat i + 3\\hat j$ and $\\vec b = \\hat i - \\hat j$, find $\\vec a \\cdot \\vec b$.',
  options: [
    { id: 'a', text: '$-1$' },
    { id: 'b', text: '$5$' },
    { id: 'c', text: '$1$' },
    { id: 'd', text: '$-5$' },
  ],
  correct_answer: 'a',
  answer_tolerance: null,
};

export const MCQ_PACK: TutorPack = {
  v: 1,
  concepts: [
    { slug: 'vector_algebra.dot_product', role: 'core' },
    { slug: 'vector_algebra.components', role: 'uses' },
  ],
  prerequisites: [
    {
      concept: 'vector_algebra.components',
      ask: 'What is the $\\hat j$ component of $4\\hat i - 7\\hat j$?',
      choices: [
        { id: 'p1', md: '$4$', correct: false, feedback: 'That is the $\\hat i$ part.' },
        { id: 'p2', md: '$-7$', correct: true },
        { id: 'p3', md: '$7$', correct: false, mistake: 'SIGN_ERROR', feedback: 'Keep the sign.' },
      ],
      teach: 'A vector $x\\hat i + y\\hat j$ has $\\hat i$ component $x$ and $\\hat j$ component $y$, sign included.',
    },
  ],
  steps: [
    {
      id: 's1',
      concept: 'vector_algebra.dot_product',
      teach: 'The dot product multiplies matching components and adds them.',
      ask: 'Which expression is $\\vec a \\cdot \\vec b$?',
      answer_kind: 'choice',
      choices: [
        { id: 'c1', md: '$2\\cdot 1 + 3\\cdot(-1)$', correct: true },
        { id: 'c2', md: '$2\\cdot(-1) + 3\\cdot 1$', correct: false, mistake: 'FORMULA_SELECTION', feedback: 'That pairs the wrong components.' },
        { id: 'c3', md: '$2 + 3 + 1 - 1$', correct: false, mistake: 'CONCEPT_MISUNDERSTANDING', feedback: 'That adds everything; the dot product multiplies pairs first.' },
      ],
      why: 'Think of $\\hat i \\cdot \\hat i = 1$ and $\\hat i \\cdot \\hat j = 0$: only matching directions survive.',
      on_correct: 'Yes. You paired $\\hat i$ with $\\hat i$ and $\\hat j$ with $\\hat j$.',
      result_md: '$\\vec a \\cdot \\vec b = 2\\cdot 1 + 3\\cdot(-1)$',
      formula: { title: 'Dot product in components', md: '$\\vec a \\cdot \\vec b = a_1 b_1 + a_2 b_2$' },
    },
    {
      id: 's2',
      concept: 'vector_algebra.dot_product',
      teach: 'Now work out the number.',
      ask: 'What is $2\\cdot 1 + 3\\cdot(-1)$?',
      answer_kind: 'number',
      expected: '-1',
      why: '$2\\cdot 1 = 2$ and $3\\cdot(-1) = -3$.',
      on_correct: 'Right, and you kept the sign.',
      result_md: '$2 - 3 = -1$',
    },
  ],
  hints: [
    'What does a dot product do with matching components?',
    'Multiply the $\\hat i$ parts, multiply the $\\hat j$ parts.',
    'Add the two products.',
    'Start with $2\\cdot 1 + 3\\cdot(-1)$.',
  ],
  mistakes: [
    { code: 'SIGN_ERROR', trigger: { option_id: 'b' }, step_id: 's2', explain: 'You got $5$, which comes from dropping the minus sign on $-1$.' },
    { code: 'FORMULA_SELECTION', trigger: { option_id: 'd' }, step_id: 's1', explain: 'That pairs the wrong components.' },
  ],
  final: { option_id: 'a', md: 'So $\\vec a \\cdot \\vec b = -1$, option (A).', praise: 'Correct. You paired the components and kept the sign.' },
};

export const NUM_QUESTION: PackQuestion = {
  question_format: 'NUMERICAL',
  question_text: 'Find $|\\vec v|$ for $\\vec v = 3\\hat i + 4\\hat j$.',
  options: null,
  correct_answer: '5',
  answer_tolerance: null,
};

export const NUM_PACK: TutorPack = {
  v: 1,
  concepts: [{ slug: 'vector_algebra.magnitude', role: 'core' }],
  prerequisites: [],
  steps: [
    {
      id: 'n1',
      concept: 'vector_algebra.magnitude',
      teach: 'The length of $x\\hat i + y\\hat j$ is $\\sqrt{x^2 + y^2}$.',
      ask: 'What is $3^2 + 4^2$?',
      answer_kind: 'number',
      expected: '25',
      why: 'It is Pythagoras on the two components.',
      on_correct: 'Yes.',
      result_md: '$3^2 + 4^2 = 25$',
    },
    {
      id: 'n2',
      concept: 'vector_algebra.magnitude',
      teach: 'Take the square root.',
      ask: 'What is $\\sqrt{25}$?',
      answer_kind: 'number',
      expected: '5',
      why: 'Which positive number squared gives 25?',
      on_correct: 'Right.',
      result_md: '$|\\vec v| = 5$',
    },
  ],
  hints: ['Think of a right triangle.', 'The components are the two short sides.', 'Use Pythagoras.', 'Compute $3^2 + 4^2$ first.'],
  mistakes: [{ code: 'INCOMPLETE_REASONING', trigger: { value: '25' }, step_id: 'n2', explain: 'You found $25$, which is the square of the length. One step left.' }],
  final: { value: '5', md: '$|\\vec v| = 5$', praise: 'Correct, and cleanly done.' },
};

export const KNOWN_CONCEPTS = new Set([
  'vector_algebra.dot_product',
  'vector_algebra.components',
  'vector_algebra.magnitude',
]);

export function facts(over: Partial<Facts> = {}): Facts {
  return {
    questionFormat: 'MCQ',
    mastery: {},
    conceptLabels: { 'vector_algebra.dot_product': 'Dot product', 'vector_algebra.components': 'Components of a vector' },
    recentlyChecked: [],
    attempt: null,
    ...over,
  };
}

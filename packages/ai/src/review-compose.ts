/**
 * Turning a student's spoken or typed words into a written review.
 *
 * Pure: the prompt, the response schema and the clean-up of what comes back. The
 * Marketing review link (/api/r/compose) and the Admin "AI tidy" button both use
 * it, so the rules for what AI may add to a student's words live in one place.
 *
 * The rule that matters most: AI may only add facts staff already verified (exam,
 * year, rank, college, centre city, mode) or that the student ticked. It never
 * invents results, names or claims. A review that says something the student did
 * not mean is worse than no review, for the student and under India's
 * fake-review rules.
 */

export const REVIEW_HELPED_CHIPS = [
  'Faculty',
  'Drawing practice',
  'Mock tests',
  'Online classes',
  'Doubt sessions',
  'Study material',
] as const;
export type ReviewHelpedChip = (typeof REVIEW_HELPED_CHIPS)[number];

export interface ReviewFacts {
  firstName?: string | null;
  examType: 'NATA' | 'JEE_PAPER_2' | 'BOTH';
  examYear?: number | null;
  airRank?: number | null;
  percentile?: number | null;
  collegeAdmitted?: string | null;
  centreCity?: string | null;
  learningMode?: 'online' | 'hybrid' | 'offline' | null;
  /** What the student ticked under "What helped most?". */
  helped?: string[];
}

const EXAM_LABEL: Record<ReviewFacts['examType'], string> = {
  NATA: 'NATA',
  JEE_PAPER_2: 'JEE Paper 2 (B.Arch)',
  BOTH: 'NATA and JEE Paper 2',
};

/** The course phrase people actually search for, used once and naturally. */
export function coursePhrase(facts: Pick<ReviewFacts, 'examType' | 'learningMode' | 'centreCity'>): string {
  const exam = facts.examType === 'JEE_PAPER_2' ? 'JEE Paper 2 coaching' : 'NATA coaching';
  if (facts.learningMode === 'online') return `${exam} online`;
  if (facts.centreCity) return `${exam} in ${facts.centreCity}`;
  return exam;
}

/** The verified facts, as lines the model may draw on and nothing more. */
export function factLines(facts: ReviewFacts): string[] {
  const lines = [`Exam: ${EXAM_LABEL[facts.examType]}${facts.examYear ? ` ${facts.examYear}` : ''}`];
  if (facts.airRank) lines.push(`All India Rank: ${facts.airRank}`);
  if (facts.percentile != null) lines.push(`Percentile: ${facts.percentile}`);
  if (facts.collegeAdmitted) lines.push(`College admitted to: ${facts.collegeAdmitted}`);
  if (facts.learningMode) lines.push(`How they studied with Neram: ${facts.learningMode}`);
  if (facts.centreCity && facts.learningMode !== 'online') lines.push(`Neram centre city: ${facts.centreCity}`);
  const helped = (facts.helped || []).filter((h) => (REVIEW_HELPED_CHIPS as readonly string[]).includes(h));
  if (helped.length) lines.push(`What helped most (ticked by the student): ${helped.join(', ')}`);
  return lines;
}

/**
 * The system instruction. `audience` changes only the framing: a student is
 * writing their own review; staff are tidying one already submitted.
 */
export function buildReviewComposeInstruction(facts: ReviewFacts, audience: 'student' | 'staff' = 'student'): string {
  const who =
    audience === 'student'
      ? 'A past student of Neram Classes (an architecture entrance coaching institute in India) is giving a review in their own words. They may speak in English, Tamil, Hindi or a mix.'
      : 'A member of Neram Classes staff is tidying a review a past student already wrote. Keep it recognisably the student\'s review.';
  return [
    who,
    '',
    'Write the review the student would write if they were good with words.',
    'Rules:',
    '- First person, in the student\'s own meaning and tone. Keep every point they made and their honest opinion, including any criticism.',
    '- Write in clear, simple English that an Indian parent would trust. Fix grammar. No marketing language.',
    `- You may mention ONLY these verified facts, and only where they fit naturally:\n  ${factLines(facts).join('\n  ')}`,
    `- Mention "${coursePhrase(facts)}" once, naturally, if it fits.`,
    '- Never invent results, ranks, scores, teacher names, colleges or claims the student did not make. No superlatives they did not say.',
    '- 60 to 120 words. One or two short paragraphs. No title, no hashtags, no emoji, no quotation marks around the whole review.',
    '- Never use em dashes or double hyphens. Use commas, full stops or brackets instead.',
    '- If the input has nothing usable (silence, noise, unrelated talk), return an empty review.',
  ].join('\n');
}

/** Structured output: one call both transcribes and writes. */
export const REVIEW_COMPOSE_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string', description: 'What the student said, word for word, in the language they used. Empty for typed input.' },
    review: { type: 'string', description: 'The written review in English, following the rules.' },
    language: { type: 'string', description: 'Main language the student used, e.g. English, Tamil, Tamil+English.' },
  },
  required: ['review'],
} as const;

/** Audio containers the compose route accepts. All are formats Gemini decodes. */
export const REVIEW_AUDIO_MIME = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac'] as const;

/** Swap em dashes and double hyphens for commas, per the project's writing rule. */
export function stripDashes(text: string): string {
  return text
    .replace(/\s*(?:—|&mdash;|--)\s*/g, ', ')
    .replace(/\s*–\s*/g, ' to ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+,/g, ',');
}

export interface ComposedReview {
  review: string;
  transcript: string | null;
  language: string | null;
}

/** Parse and clean Gemini's JSON. Throws on something that is not a review. */
export function parseComposedReview(raw: string): ComposedReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models wrap JSON in a code fence despite the mime type.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The AI answer was not JSON.');
    parsed = JSON.parse(match[0]);
  }
  const obj = (parsed || {}) as Record<string, unknown>;
  const review = stripDashes(String(obj.review ?? ''))
    .replace(/^["“]|["”]$/g, '')
    .trim()
    .slice(0, 1500);
  const transcript = typeof obj.transcript === 'string' && obj.transcript.trim() ? obj.transcript.trim().slice(0, 4000) : null;
  const language = typeof obj.language === 'string' && obj.language.trim() ? obj.language.trim().slice(0, 40) : null;
  return { review, transcript, language };
}

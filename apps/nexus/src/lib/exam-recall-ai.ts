/**
 * AI utilities for the NATA Exam Recall feature.
 * Uses Google Gemini Flash for:
 *  - OCR extraction of questions from handwritten/printed images
 *  - Semantic similarity matching between recalled questions
 *  - NATA syllabus topic categorisation
 *
 * All functions degrade gracefully — on failure they return empty/default
 * results instead of throwing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ExtractedQuestion {
  question_text: string;
  question_type: 'mcq' | 'numerical' | 'fill_blank' | 'drawing' | 'unknown';
  section: 'part_a' | 'part_b' | 'unknown';
  options?: string[];
  answer?: string;
  topic_hint?: string;
  confidence: number; // 0–1
}

export interface SimilarMatch {
  thread_id: string;
  similarity: number; // 0–1
  reasoning: string;
}

export interface TopicSuggestion {
  category: string;
  confidence: number; // 0–1
}

// ---------------------------------------------------------------------------
// Rate-limit helper (simple in-memory sliding window)
// ---------------------------------------------------------------------------

const MAX_CALLS_PER_MINUTE = 15;
const callTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove entries older than 60 s
  while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS_PER_MINUTE) {
    return true;
  }
  callTimestamps.push(now);
  return false;
}

// ---------------------------------------------------------------------------
// Shared Gemini helper
// ---------------------------------------------------------------------------

function getModel(temperature = 0.1) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
    },
  });
}

// ---------------------------------------------------------------------------
// 1. extractQuestionsFromImage
// ---------------------------------------------------------------------------

const EXTRACT_SYSTEM_PROMPT = `You are an expert at reading and transcribing exam questions from images. The images may contain:
- Handwritten notes (messy handwriting, in English or mixed English/Hindi)
- Printed question papers (may include Hindi translations)
- Bullet-pointed notes or lists

Your task is to extract each individual question from the image and return structured JSON.

Rules:
1. Separate each distinct question into its own entry.
2. Determine the question_type: "mcq" (has multiple-choice options), "numerical" (expects a number), "fill_blank" (fill in the blank), "drawing" (asks for a sketch/drawing), or "unknown".
3. Determine the section: "part_a" (drawing-related, creative, composition), "part_b" (MCQ/numerical/theory), or "unknown" if unclear.
4. If MCQ options are visible, include them in "options" as an array of strings.
5. If an answer is visible (circled, underlined, marked), include it in "answer".
6. Guess the NATA syllabus topic in "topic_hint" (e.g. "visual_reasoning", "numerical_ability", "gk_architecture", "drawing", "design_sensitivity", "logical_derivation", "language").
7. Set "confidence" between 0 and 1 — how confident you are in the accuracy of your extraction (lower for blurry/messy text).
8. For text you cannot read at all, skip it. Do not invent content.

Return a JSON object: { "questions": [ ... ] } where each element matches the ExtractedQuestion interface.`;

export async function extractQuestionsFromImage(
  imageBase64: string,
  mimeType: string
): Promise<ExtractedQuestion[]> {
  if (isRateLimited()) {
    console.error('[exam-recall-ai] Rate limited — skipping extractQuestionsFromImage');
    return [];
  }

  try {
    const model = getModel(0.1);

    const result = await model.generateContent([
      { text: EXTRACT_SYSTEM_PROMPT },
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
      {
        text: 'Extract all questions from this image. Return JSON only.',
      },
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text) as { questions?: ExtractedQuestion[] };

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      console.error('[exam-recall-ai] Gemini returned invalid structure for image extraction');
      return [];
    }

    // Sanitise each question
    return parsed.questions.map((q) => ({
      question_text: q.question_text || '',
      question_type: (['mcq', 'numerical', 'fill_blank', 'drawing', 'unknown'] as const).includes(
        q.question_type
      )
        ? q.question_type
        : 'unknown',
      section: (['part_a', 'part_b', 'unknown'] as const).includes(q.section)
        ? q.section
        : 'unknown',
      options: Array.isArray(q.options) ? q.options : undefined,
      answer: q.answer || undefined,
      topic_hint: q.topic_hint || undefined,
      confidence: typeof q.confidence === 'number' ? Math.min(1, Math.max(0, q.confidence)) : 0.5,
    }));
  } catch (err) {
    console.error('[exam-recall-ai] extractQuestionsFromImage failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 2. findSimilarRecalls
// ---------------------------------------------------------------------------

interface RecallEntry {
  id: string;
  text: string;
  exam_date: string;
  session_number: number;
}

const BATCH_SIZE = 50;

const SIMILARITY_SYSTEM_PROMPT = `You are an expert at comparing exam questions. Given a "query" question and a list of "existing" recalled questions, identify which existing questions describe the SAME or very similar question (even if worded differently, paraphrased, or written in different languages).

Rules:
1. Only return matches with similarity >= 0.6.
2. Similarity of 1.0 = identical question. 0.6 = clearly the same concept/question with significant wording differences.
3. Consider that students may recall the same question differently — focus on the core concept, not exact wording.
4. Provide a brief reasoning (1 sentence) for each match.
5. Return JSON: { "matches": [ { "thread_id": "<id>", "similarity": <0-1>, "reasoning": "<brief explanation>" } ] }
6. If no matches found, return { "matches": [] }.`;

async function findSimilarInBatch(
  queryText: string,
  batch: RecallEntry[]
): Promise<SimilarMatch[]> {
  try {
    const model = getModel(0.1);

    const existingList = batch
      .map(
        (r) =>
          `ID: ${r.id} | Date: ${r.exam_date} | Session: ${r.session_number} | Text: ${r.text}`
      )
      .join('\n');

    const prompt = `${SIMILARITY_SYSTEM_PROMPT}

QUERY QUESTION:
${queryText}

EXISTING RECALLED QUESTIONS:
${existingList}

Find matches. Return JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as { matches?: SimilarMatch[] };

    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      return [];
    }

    return parsed.matches
      .filter((m) => typeof m.similarity === 'number' && m.similarity >= 0.6)
      .map((m) => ({
        thread_id: m.thread_id,
        similarity: Math.min(1, Math.max(0, m.similarity)),
        reasoning: m.reasoning || '',
      }));
  } catch (err) {
    console.error('[exam-recall-ai] findSimilarInBatch failed:', err);
    return [];
  }
}

export async function findSimilarRecalls(
  queryText: string,
  existingRecalls: RecallEntry[]
): Promise<SimilarMatch[]> {
  if (!existingRecalls.length) {
    return [];
  }

  if (isRateLimited()) {
    console.error('[exam-recall-ai] Rate limited — skipping findSimilarRecalls');
    return [];
  }

  try {
    const allMatches: SimilarMatch[] = [];

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < existingRecalls.length; i += BATCH_SIZE) {
      const batch = existingRecalls.slice(i, i + BATCH_SIZE);

      // Check rate limit before each subsequent batch
      if (i > 0 && isRateLimited()) {
        console.error('[exam-recall-ai] Rate limited mid-batch — returning partial results');
        break;
      }

      const batchMatches = await findSimilarInBatch(queryText, batch);
      allMatches.push(...batchMatches);
    }

    // Deduplicate by thread_id, keeping highest similarity
    const bestByThread = new Map<string, SimilarMatch>();
    for (const match of allMatches) {
      const existing = bestByThread.get(match.thread_id);
      if (!existing || match.similarity > existing.similarity) {
        bestByThread.set(match.thread_id, match);
      }
    }

    return Array.from(bestByThread.values()).sort(
      (a, b) => b.similarity - a.similarity
    );
  } catch (err) {
    console.error('[exam-recall-ai] findSimilarRecalls failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. suggestTopicCategory
// ---------------------------------------------------------------------------

const TOPIC_CATEGORIES = [
  'visual_reasoning',
  'logical_derivation',
  'gk_architecture',
  'language',
  'design_sensitivity',
  'numerical_ability',
  'drawing',
] as const;

const TOPIC_SYSTEM_PROMPT = `You are a NATA exam syllabus expert. Given a question text, classify it into exactly ONE of the following NATA syllabus topic categories:

1. visual_reasoning — mirror images, paper folding, 2D/3D composition, spatial visualization, figure completion, series completion
2. logical_derivation — pattern recognition, decoding, drawing conclusions, statements & conclusions, data interpretation, logical puzzles
3. gk_architecture — famous buildings, monuments, famous architects, building materials, urban planning, architectural history, current affairs in architecture
4. language — grammar, synonyms, comprehension, word meanings, passage-based questions, vocabulary
5. design_sensitivity — observation, critical thinking, metaphors, problem analysis, color theory, visual harmony, design principles, aesthetics
6. numerical_ability — algebra, trigonometry, geometry, statistics, mensuration, percentage, profit/loss, probability, coordinate geometry, sets, logarithms
7. drawing — composition, sketching, 3D modeling, creative drawing, color composition

Return JSON: { "category": "<one of the 7 categories>", "confidence": <0-1> }
Set confidence based on how clearly the question fits the category.`;

export async function suggestTopicCategory(
  questionText: string
): Promise<TopicSuggestion> {
  const defaultResult: TopicSuggestion = { category: 'unknown', confidence: 0 };

  if (!questionText.trim()) {
    return defaultResult;
  }

  if (isRateLimited()) {
    console.error('[exam-recall-ai] Rate limited — skipping suggestTopicCategory');
    return defaultResult;
  }

  try {
    const model = getModel(0.1);

    const prompt = `${TOPIC_SYSTEM_PROMPT}

QUESTION:
${questionText}

Classify this question. Return JSON only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text) as { category?: string; confidence?: number };

    const category = parsed.category || 'unknown';
    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;

    // Validate category
    if (TOPIC_CATEGORIES.includes(category as (typeof TOPIC_CATEGORIES)[number])) {
      return { category, confidence };
    }

    console.error(
      `[exam-recall-ai] Gemini returned unknown category "${category}", defaulting to "unknown"`
    );
    return { category: 'unknown', confidence: 0 };
  } catch (err) {
    console.error('[exam-recall-ai] suggestTopicCategory failed:', err);
    return defaultResult;
  }
}

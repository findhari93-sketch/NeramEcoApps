/**
 * AI utilities for the NATA Exam Recall feature.
 *  - OCR extraction of questions from handwritten/printed images
 *  - Semantic similarity matching between recalled questions
 *
 * All functions degrade gracefully: on failure they return empty/default
 * results instead of throwing. A student who uploaded a blurry photo should get
 * "nothing found", not an error page.
 *
 * Two things were fixed when this moved onto @neram/ai:
 *
 * 1. It was pinned to gemini-2.0-flash, which Google shut down on 1 June 2026.
 *    Every call here had been failing since, silently, because the catch blocks
 *    turn a failure into an empty array. Models now come from the feature
 *    registry, so the next shutdown is one edit in packages/ai/src/pricing.ts.
 *
 * 2. The in-memory sliding window (MAX_CALLS_PER_MINUTE = 15) that used to sit
 *    at the top of this file did nothing. Each serverless invocation got a fresh
 *    module scope, so the array was almost always empty and the limit never
 *    fired. Rate limiting now lives in the budget guard, which reads a shared
 *    rollup table and therefore actually holds across invocations.
 *
 * suggestTopicCategory used to live here too. It was exported and never called
 * by anything, so it went with the rewrite rather than being ported.
 */

import { generateGeminiText } from '@neram/ai';

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
  confidence: number; // 0-1
}

export interface SimilarMatch {
  thread_id: string;
  similarity: number; // 0-1
  reasoning: string;
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
7. Set "confidence" between 0 and 1, how confident you are in the accuracy of your extraction (lower for blurry/messy text).
8. For text you cannot read at all, skip it. Do not invent content.

Return a JSON object: { "questions": [ ... ] } where each element matches the ExtractedQuestion interface.`;

export async function extractQuestionsFromImage(
  imageBase64: string,
  mimeType: string,
  actorId?: string | null
): Promise<ExtractedQuestion[]> {
  try {
    const text = await generateGeminiText({
      feature: 'nexus.exam-recall-ocr',
      actorId,
      parts: [
        { text: EXTRACT_SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: 'Extract all questions from this image. Return JSON only.' },
      ],
      temperature: 0.1,
    });

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

/**
 * Batches to compare in one request.
 *
 * A student uploading during a live exam window can have hundreds of existing
 * recalls to compare against, and at fifty per call that is a lot of requests
 * from one button press. Three batches covers 150 recalls, which is past the
 * point where a further match changes what the student sees.
 */
const MAX_BATCHES = 3;

const SIMILARITY_SYSTEM_PROMPT = `You are an expert at comparing exam questions. Given a "query" question and a list of "existing" recalled questions, identify which existing questions describe the SAME or very similar question (even if worded differently, paraphrased, or written in different languages).

Rules:
1. Only return matches with similarity >= 0.6.
2. Similarity of 1.0 = identical question. 0.6 = clearly the same concept/question with significant wording differences.
3. Consider that students may recall the same question differently, focus on the core concept, not exact wording.
4. Provide a brief reasoning (1 sentence) for each match.
5. Return JSON: { "matches": [ { "thread_id": "<id>", "similarity": <0-1>, "reasoning": "<brief explanation>" } ] }
6. If no matches found, return { "matches": [] }.`;

async function findSimilarInBatch(
  queryText: string,
  batch: RecallEntry[],
  actorId?: string | null
): Promise<SimilarMatch[]> {
  try {
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

    const text = await generateGeminiText({
      feature: 'nexus.exam-recall-match',
      actorId,
      parts: [{ text: prompt }],
      temperature: 0.1,
    });

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
  existingRecalls: RecallEntry[],
  actorId?: string | null
): Promise<SimilarMatch[]> {
  if (!existingRecalls.length) {
    return [];
  }

  try {
    const allMatches: SimilarMatch[] = [];

    for (let i = 0; i < existingRecalls.length && i < BATCH_SIZE * MAX_BATCHES; i += BATCH_SIZE) {
      const batch = existingRecalls.slice(i, i + BATCH_SIZE);
      const batchMatches = await findSimilarInBatch(queryText, batch, actorId);
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

    return Array.from(bestByThread.values()).sort((a, b) => b.similarity - a.similarity);
  } catch (err) {
    console.error('[exam-recall-ai] findSimilarRecalls failed:', err);
    return [];
  }
}

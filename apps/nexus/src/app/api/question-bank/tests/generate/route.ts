import { NextRequest, NextResponse } from 'next/server';
import { listQBTags, getSupabaseAdminClient } from '@neram/database';
import { AiBlockedError, generateGeminiText } from '@neram/ai';
import { verifyQBAccess } from '@/lib/qb-auth';
import { buildImportPrompt, validateImportJSON, type ImportExam } from '@/lib/qb-import-schema';
import { GenerateSourceError, resolveGenerateSource } from '@/lib/generate-source';
import { FEATURE_BY_MODE, type GenerateMode } from '@/lib/ai-question-cost';
import type { DraftFormat } from '@/lib/test-wizard-draft';

/**
 * POST /api/question-bank/tests/generate   (teacher/admin)
 *
 * Step 2 of the test wizard, AI branch. Writes NOTHING.
 *
 * That is the whole contract of the wizard: "nothing is saved until you approve
 * it". This route asks the model, validates the reply and hands the questions
 * back for review. The teacher can close the tab and the bank is untouched.
 *
 * It deliberately returns the SAME shape validateImportJSON produces, which is
 * the same shape the paste branch produces, which is why step 3 is one screen
 * rather than one per source.
 *
 * Contrast with study-materials/files/[id]/test/generate, which publishes in one
 * press and therefore has to drop any question the model could not ground in a
 * quote. Here a human reads every question before it exists, so an ungrounded
 * question is shown with its missing quote rather than silently discarded.
 */

/** A multi-megabyte PDF, a 40-question reply and a cold model. Two minutes is not enough. */
export const maxDuration = 300;

const MAX_COUNT = 80;
const FORMAT_WORDS: Record<DraftFormat, string> = {
  MCQ: 'multiple choice with four options',
  NUMERICAL: 'numerical answer, no options',
  DRAWING_PROMPT: 'a drawing brief to be answered on paper',
  IMAGE_BASED: 'built around a figure',
};

function clampCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(MAX_COUNT, Math.round(n)));
}

/** The teacher's controls, as sentences appended to the shared prompt. */
function steeringLines(opts: {
  difficulty: 'easy' | 'mixed' | 'hard';
  formats: DraftFormat[];
  steer: string;
}): string {
  const lines: string[] = [];
  if (opts.difficulty === 'easy') lines.push('Keep every question EASY.');
  else if (opts.difficulty === 'hard') lines.push('Keep every question HARD.');

  if (opts.formats.length > 0) {
    lines.push(
      `Write only these kinds of question: ${opts.formats.map((f) => FORMAT_WORDS[f]).join('; ')}.`,
    );
  }
  // Last, so a teacher's own words are the final instruction the model reads.
  if (opts.steer.trim()) lines.push(opts.steer.trim());
  return lines.length > 0 ? `\n\nALSO\n${lines.join('\n')}` : '';
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can build tests' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const mode: GenerateMode =
      body?.mode === 'pdf' || body?.mode === 'recording' ? body.mode : 'topic';
    const count = clampCount(body?.count);
    const difficulty =
      body?.difficulty === 'easy' || body?.difficulty === 'hard' ? body.difficulty : 'mixed';
    const formats: DraftFormat[] = Array.isArray(body?.formats) && body.formats.length > 0
      ? body.formats
      : ['MCQ'];
    const exam: ImportExam =
      body?.exam === 'JEE' || body?.exam === 'BOTH' || body?.exam === 'NATA' ? body.exam : 'NATA';
    const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';

    if (mode === 'topic' && !topic) {
      return NextResponse.json({ error: 'Say what the questions should be about' }, { status: 400 });
    }

    // ── 1. What the model reads ──────────────────────────────────────────────
    const source = await resolveGenerateSource({
      mode,
      fileId: body?.file_id ?? null,
      classId: body?.class_id ?? null,
      supabase: getSupabaseAdminClient(),
    });

    // ── 2. Ask ───────────────────────────────────────────────────────────────
    const registry = (await listQBTags()).map((t: any) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      group_type: t.group_type,
    }));

    const prompt =
      buildImportPrompt(registry, {
        // A hint the prompt tells the model it may overrule, because a filename
        // names the file and not always the chapter.
        chapter: topic || source.label || undefined,
        exam,
        count,
        fromDocument: mode !== 'topic',
      }) + steeringLines({ difficulty, formats, steer: String(body?.steer ?? '') });

    const featureId = FEATURE_BY_MODE[mode];
    let raw: string;
    try {
      raw = await generateGeminiText({
        feature: featureId,
        actorId: access.caller.id,
        parts: [...source.parts, { text: prompt }],
        // The 4096 default truncates a 40-question reply with explanations less
        // than halfway through, and a truncated reply costs the same as a whole one.
        maxOutputTokens: 16384,
      });
    } catch (err) {
      // Manual mode or a spent budget. Not a failure: hand back the prompt so
      // the teacher can run it themselves and come back through Upload JSON,
      // which is exactly what the wizard's cost rail already points at.
      if (err instanceof AiBlockedError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason, manualPrompt: err.manualPrompt },
          { status: 409 },
        );
      }
      const message = err instanceof Error ? err.message : 'The AI could not be reached';
      // One key serves all four apps, so this is the common failure and worth
      // naming rather than reporting as a generic error.
      if (message.includes('429')) {
        return NextResponse.json(
          { error: 'The AI is rate limited right now. Try again in a few minutes.' },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // ── 3. Validate, and hand back for review ────────────────────────────────
    const parsed = validateImportJSON(raw, registry);
    if (parsed.questions.length === 0) {
      return NextResponse.json(
        { error: parsed.errors[0] || 'The AI did not return any usable questions.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      data: {
        test: parsed.test,
        questions: parsed.questions,
        proposed_tags: parsed.proposedTags,
        errors: parsed.errors,
        warnings: parsed.warnings,
        schema: parsed.schema,
        source: source.meta,
      },
    });
  } catch (err) {
    if (err instanceof GenerateSourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to generate questions';
    console.error('Test generate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

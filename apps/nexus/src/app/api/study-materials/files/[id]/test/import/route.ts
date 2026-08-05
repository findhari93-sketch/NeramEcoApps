import { NextRequest, NextResponse } from 'next/server';
import { getFileById, listQBTags } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { validateImportJSON } from '@/lib/qb-import-schema';
import { ImportInputError } from '@/lib/qb-import-service';
import { buildChapterTest } from '@/lib/chapter-test-build';
import type { TestImportSource } from '@/lib/test-import-store';

/**
 * POST /api/study-materials/files/[id]/test/import   (staff)
 *
 * Put a question set the teacher wrote elsewhere onto a chapter.
 *
 * The sibling route asks Gemini for the questions. This one is handed them: the
 * teacher took the chapter's own prompt to whichever model they prefer, checked
 * the reply, and brought the JSON back. Everything after "here are the
 * questions" is the same code, in chapter-test-build.
 *
 * Body: { payload, serve?, passing_pct?, source?, file_name? }
 *
 * `payload` is the RAW JSON TEXT, not the rows the browser parsed out of it.
 * The dialog parses the same text with the same function to show a count before
 * anything is written, but that parse is a courtesy to the teacher, not an
 * input to this route. Sending rows would make the client's reading of the file
 * the thing that gets saved, and the two parsers could then disagree about what
 * the file said.
 */

/**
 * Dedupe is one pg_trgm scan per question, run one at a time on purpose, so a
 * 150-question upload is 150 sequential round trips. Well inside this, and far
 * outside the 60 second default.
 */
export const maxDuration = 300;

const DEFAULT_SERVE = 20;
const DEFAULT_PASSING_PCT = 70;
/**
 * The largest reply worth accepting as text. validateImportJSON stops at 200
 * questions anyway; this is only here so a mis-drop of a large file fails with a
 * sentence rather than as a parser timeout.
 */
const MAX_PAYLOAD_CHARS = 2_000_000;

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const body = await request.json().catch(() => ({}));
    const payload = typeof body?.payload === 'string' ? body.payload : '';
    if (!payload.trim()) {
      return NextResponse.json({ error: 'No questions were sent.' }, { status: 400 });
    }
    if (payload.length > MAX_PAYLOAD_CHARS) {
      return NextResponse.json(
        { error: 'That file is too large to read. Split it and import it in two parts.' },
        { status: 400 },
      );
    }
    const passingPct = clamp(body?.passing_pct, DEFAULT_PASSING_PCT, 1, 100);
    const source: TestImportSource = body?.source === 'file_upload' ? 'file_upload' : 'paste';
    const fileName = typeof body?.file_name === 'string' ? body.file_name.slice(0, 200) : null;

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    // Deliberately no PDF check, unlike the generator. That route needs a PDF
    // because it reads one; this one only needs somewhere to hang the test.

    const registry = (await listQBTags()).map((t: any) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      group_type: t.group_type,
    }));

    const parsed = validateImportJSON(payload, registry);
    if (parsed.questions.length === 0) {
      // 400, not 502: this is the teacher's file, and the first error names the
      // row that broke rather than blaming a model that was never involved.
      return NextResponse.json(
        { error: parsed.errors[0] || 'No usable questions in that file.' },
        { status: 400 },
      );
    }

    // The grounding filter the generator applies is NOT applied here, and that
    // is the one real difference between the two routes. It exists because
    // nobody reads AI questions before students do, so a question that cannot be
    // quoted from the chapter is an unchecked claim. A teacher who wrote and
    // checked these questions is that reader. Running the filter here would
    // silently discard most of a hand-written set for lacking a field the paste
    // contract has always treated as optional.

    // Serve is clamped to what the file actually yielded, not to the AI route's
    // pool cap: the whole reason to upload is that you already have more
    // questions than one model call produces.
    const serve = clamp(body?.serve, DEFAULT_SERVE, 1, parsed.questions.length);

    const result = await buildChapterTest({
      file,
      parsed,
      questions: parsed.questions,
      serve,
      passingPct,
      callerId: user.id,
      source,
      createdFrom: 'study_upload',
      promptMeta: {
        serve,
        passing_pct: passingPct,
        questions_read: parsed.questions.length,
        rows_skipped: parsed.errors.length,
        file_name: fileName,
        source_file_title: file.title,
      },
    });

    return NextResponse.json(
      {
        data: {
          test_id: result.test_id,
          title: result.title,
          created: result.created,
          reused: result.reused,
          pool_size: result.question_count,
          serve: result.serve,
          skipped: parsed.errors.length,
          warnings: parsed.warnings.slice(0, 5),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Failed to import the test';
    if (message === 'Not authorized') return NextResponse.json({ error: message }, { status: 403 });
    console.error('Chapter test import error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

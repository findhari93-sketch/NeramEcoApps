import { NextRequest, NextResponse } from 'next/server';
import { getFileById, listQBTags } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { getSharePointDownloadUrl, getSharePointStreamUrl } from '@/lib/sharepoint';
import { AiBlockedError, generateGeminiText } from '@neram/ai';
import { buildImportPrompt, validateImportJSON, type ImportExam } from '@/lib/qb-import-schema';
import { ImportInputError } from '@/lib/qb-import-service';
import { buildChapterTest } from '@/lib/chapter-test-build';

/**
 * POST /api/study-materials/files/[id]/test/generate   (staff)
 *
 * Turn a chapter PDF into a published test in one press.
 *
 * Every part of this existed already and had never been joined up. The server
 * has downloaded study-material bytes from SharePoint on every student file
 * view since the module shipped; the Gemini client has accepted inline_data
 * since it was factored out of class-summary-ai; buildImportPrompt,
 * validateImportJSON, the dedupe and the commit are the paste wizard's own
 * machinery. The only thing nobody had written was "send the bytes to the
 * model", so the teacher did that part by hand, in a chat window, nine times.
 *
 * Body: { pool_size?, serve?, exam?, passing_pct? }
 *
 * The test is PUBLISHED on creation, with nobody reading it first. That is a
 * deliberate choice and it is why source_quote exists: a question the model
 * could not ground in a sentence of the document is dropped here rather than
 * shown to a student. See the grounding filter below.
 */

/** A multi-megabyte PDF, a 40-question reply and a cold model. Two minutes is not enough. */
export const maxDuration = 300;

/**
 * Gemini caps an inline_data request near 20 MB and base64 costs a third on
 * top, so this is the largest file that fits with room for the prompt. The
 * Foundation chapters top out at 5.63 MB. Anything bigger needs the Files API,
 * which the client does not implement.
 */
const MAX_PDF_BYTES = 14 * 1024 * 1024;

const DEFAULT_POOL = 40;
const DEFAULT_SERVE = 20;
const DEFAULT_PASSING_PCT = 70;
/** Enough to be a pool worth drawing from, few enough to survive one model call. */
const MAX_POOL = 80;

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
    const poolSize = clamp(body?.pool_size, DEFAULT_POOL, 5, MAX_POOL);
    const serve = Math.min(clamp(body?.serve, DEFAULT_SERVE, 1, MAX_POOL), poolSize);
    const passingPct = clamp(body?.passing_pct, DEFAULT_PASSING_PCT, 1, 100);
    const exam: ImportExam =
      body?.exam === 'JEE' || body?.exam === 'BOTH' || body?.exam === 'NATA' ? body.exam : 'NATA';

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    // file_type holds the MIME type the upload route recorded from the browser.
    if (file.file_type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only a PDF can be turned into a test. This file is not one.' },
        { status: 400 },
      );
    }

    // ── 1. The chapter itself ────────────────────────────────────────────────
    // Same two resolvers the content route uses, both app-only, so this works
    // without the teacher's Graph token and would work from a cron.
    const downloadUrl = file.link_url
      ? await getSharePointStreamUrl(file.link_url)
      : await getSharePointDownloadUrl(String(file.sharepoint_item_id));
    const upstream = await fetch(downloadUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Could not read the PDF from SharePoint' }, { status: 502 });
    }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_PDF_BYTES) {
      const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        { error: `This chapter is ${mb} MB. The model accepts up to 14 MB, so split it first.` },
        { status: 400 },
      );
    }

    // ── 2. Ask for the questions ─────────────────────────────────────────────
    const registry = (await listQBTags()).map((t: any) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      group_type: t.group_type,
    }));

    const prompt = buildImportPrompt(registry, {
      // A hint, not an instruction. The prompt tells the model to prefer what
      // the document calls itself, because a filename like
      // "Islamic architecture _ Chapter 2" names the file, not the chapter.
      chapter: file.title,
      exam,
      count: poolSize,
      fromDocument: true,
    });

    let raw: string;
    try {
      raw = await generateGeminiText({
        // The 'document' tier keeps this off the lite models, which read an
        // attached PDF poorly. That used to be a pinned `models` array here;
        // it lives in packages/ai/src/pricing.ts now so a model shutdown is
        // one edit rather than a hunt through call sites.
        feature: 'nexus.chapter-test',
        actorId: user.id,
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
          { text: prompt },
        ],
        // 4096 is the client default and truncates a 40-question reply with
        // explanations less than halfway through.
        maxOutputTokens: 16384,
      });
    } catch (err) {
      // Manual mode or a spent budget. Not a failure: hand back the prompt so
      // the teacher can run it themselves and paste the JSON into Import.
      if (err instanceof AiBlockedError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason, manualPrompt: err.manualPrompt },
          { status: 409 },
        );
      }

      const message = err instanceof Error ? err.message : 'The AI could not be reached';
      // One key serves all four apps, so this is the common failure and it is
      // worth naming rather than reporting as a generic error.
      if (message.includes('429')) {
        return NextResponse.json(
          { error: 'The AI is rate limited right now. Try this chapter again in a few minutes.' },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const parsed = validateImportJSON(raw, registry);
    if (parsed.questions.length === 0) {
      return NextResponse.json(
        { error: parsed.errors[0] || 'The AI did not return any usable questions.' },
        { status: 502 },
      );
    }

    // ── 3. The grounding filter ──────────────────────────────────────────────
    // Nobody reads these before students do, so "the model wrote it" cannot be
    // the only reason a question is trusted. A question that could not be tied
    // to a sentence of the chapter is exactly the kind that gets invented, and
    // it is dropped rather than published.
    const grounded = parsed.questions.filter((q) => !!q.source_quote);
    const droppedUngrounded = parsed.questions.length - grounded.length;
    if (grounded.length === 0) {
      return NextResponse.json(
        { error: 'None of the questions could be traced back to the chapter, so none were kept.' },
        { status: 502 },
      );
    }

    // ── 4. Dedupe, commit, archive, place ────────────────────────────────────
    // Shared with the upload route, which reaches the same place having been
    // handed its questions by a teacher instead of by the model.
    const result = await buildChapterTest({
      file,
      parsed,
      questions: grounded,
      serve,
      passingPct,
      callerId: user.id,
      source: 'pdf_generate',
      createdFrom: 'ai_pdf',
      promptMeta: {
        exam,
        pool_size: poolSize,
        serve,
        passing_pct: passingPct,
        model: 'gemini-2.5-flash',
        dropped_ungrounded: droppedUngrounded,
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
          dropped_ungrounded: droppedUngrounded,
          warnings: parsed.warnings.slice(0, 5),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Failed to generate a test';
    if (message === 'Not authorized') return NextResponse.json({ error: message }, { status: 403 });
    console.error('Chapter test generate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

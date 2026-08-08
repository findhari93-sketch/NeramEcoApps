import { NextRequest, NextResponse } from 'next/server';
import { createPlacement, type NexusPlacementContext } from '@neram/database';
import { verifyQBAccess } from '@/lib/qb-auth';
import { commitImport, ImportInputError, type CommitRow } from '@/lib/qb-import-service';
import { saveTestImportPayload, type TestImportSource } from '@/lib/test-import-store';

/**
 * POST /api/question-bank/tests/publish   (teacher/admin)
 *
 * The wizard's ONE write. Everything before this point is a draft in a browser
 * tab, which is what lets step 3 promise "nothing is saved until you approve
 * it" without qualification.
 *
 * Replaces the old two-step create-then-place, where a failure between the two
 * left a test in the library that the teacher believed was on a class. Here the
 * test is built first and placed second, deliberately in that order: a
 * placement that fails leaves a usable test sitting in the library, whereas the
 * reverse would leave a context pointing at a test that does not exist.
 *
 * Placement failures are therefore REPORTED, not thrown. A chapter that already
 * holds a test is a thing the teacher needs to be told about and decide on, and
 * answering the whole request with a 500 would lose the test they just built
 * along with the message explaining why.
 */

/** Contexts a generic placement may create. The gated kinds are excluded on purpose. */
const GENERIC_CONTEXTS: NexusPlacementContext[] = [
  'study_file',
  'classroom_assignment',
  'class_recap_section',
  'foundation_section',
  'module_item',
  'student_practice',
  'qb_paper',
];

interface PlacementBody {
  context_type?: string;
  context_id?: string;
  passing_pct?: number | null;
  available_from?: string | null;
  available_until?: string | null;
  gating?: Record<string, unknown>;
}

export interface PlacementOutcome {
  context_type: string;
  ok: boolean;
  error?: string;
}

function timerFields(rules: any): { timerType: 'none' | 'full'; durationMinutes: number | null } {
  const timed = Boolean(rules?.timed);
  const minutes = Number(rules?.durationMinutes);
  return {
    timerType: timed ? 'full' : 'none',
    durationMinutes: timed && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can publish tests' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return NextResponse.json({ error: 'Give the test a name' }, { status: 400 });

    const rules = body?.rules ?? {};
    const questions = Array.isArray(body?.questions) ? body.questions : [];

    // Split the draft the way commitImport wants it: rows it has to author, and
    // bank ids it only has to reference. A bank row is never re-authored, which
    // is the whole reason the picker branch is cheap.
    const authored: CommitRow[] = [];
    const bankIds: string[] = [];
    for (const q of questions) {
      if (q?.action === 'skip') continue;
      if (q?.bank_question_id) {
        bankIds.push(String(q.bank_question_id));
        continue;
      }
      authored.push({
        action: q?.action ?? 'create',
        existing_question_id: q?.existing_question_id ?? null,
        use_in_test: q?.use_in_test ?? 'new',
        question_text: q?.question_text,
        question_format: q?.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ',
        options: q?.options ?? null,
        correct_answer: q?.correct_answer,
        explanation: q?.explanation ?? null,
        difficulty: q?.difficulty,
        exam_relevance: q?.exam_relevance,
        tag_ids: Array.isArray(q?.tag_ids) ? q.tag_ids : [],
        new_tag_slugs: Array.isArray(q?.new_tag_slugs) ? q.new_tag_slugs : [],
      });
    }

    if (authored.length === 0 && bankIds.length === 0) {
      return NextResponse.json({ error: 'A test needs at least one question' }, { status: 400 });
    }

    const { timerType, durationMinutes } = timerFields(rules);
    const passingPct = Number.isFinite(Number(rules?.passPct)) ? Number(rules.passPct) : null;

    // ── 1. Build the test ────────────────────────────────────────────────────
    const result = await commitImport({
      title,
      callerId: access.caller.id,
      rows: authored,
      extraQuestionIds: bankIds,
      newTags: Array.isArray(body?.proposed_tags) ? body.proposed_tags : [],
      folderId: body?.folder_id ?? null,
      folderPath: Array.isArray(body?.folder_path) ? body.folder_path : null,
      testKind: body?.test_kind,
      timerType,
      durationMinutes,
      passingPct,
      isPublished: body?.publish !== false,
      createdFrom: typeof body?.created_from === 'string' ? body.created_from : 'wizard',
      origin: 'imported',
    });

    // ── 2. Keep the source JSON with the test ────────────────────────────────
    // This is what makes the detail page's "download, edit anywhere, re-upload
    // as v2" real. Best effort: a test that exists must not be reported as a
    // failure because its provenance record could not be written.
    const source: TestImportSource =
      body?.source === 'json' ? 'paste' : body?.source === 'ai' ? 'pdf_generate' : 'edit';
    try {
      await saveTestImportPayload({
        testId: result.test_id,
        source,
        createdBy: access.caller.id,
        sourceFileId: body?.source_file_id ?? null,
        promptMeta: body?.prompt_meta ?? {},
        extras: Object.fromEntries(
          questions
            .filter((q: any) => q?.question_text && q?.source_quote)
            .map((q: any) => [q.question_text, { source_quote: q.source_quote }]),
        ),
      });
    } catch (err) {
      console.error('Test publish: provenance not stored:', err);
    }

    // ── 3. Place it ──────────────────────────────────────────────────────────
    // Each on its own, so one refused chapter does not cost the teacher the
    // class-test placement that worked.
    const placements: PlacementOutcome[] = [];
    for (const p of (Array.isArray(body?.placements) ? body.placements : []) as PlacementBody[]) {
      const contextType = String(p?.context_type || '') as NexusPlacementContext;
      if (!GENERIC_CONTEXTS.includes(contextType)) {
        placements.push({
          context_type: contextType || 'unknown',
          ok: false,
          // The gated kinds each have a route that writes their own gating, and
          // creating one here would produce a class test with no due date that
          // reads as required forever.
          error: 'That placement is made from its own page, not from the wizard',
        });
        continue;
      }
      if (!p?.context_id) {
        placements.push({ context_type: contextType, ok: false, error: 'Nothing was chosen to place it on' });
        continue;
      }
      try {
        await createPlacement({
          testId: result.test_id,
          contextType,
          contextId: String(p.context_id),
          passingPct: p.passing_pct ?? passingPct,
          availableFrom: p.available_from ?? null,
          availableUntil: p.available_until ?? null,
          gating: p.gating ?? {},
          createdBy: access.caller.id,
        });
        placements.push({ context_type: contextType, ok: true });
      } catch (err) {
        placements.push({
          context_type: contextType,
          ok: false,
          error: err instanceof Error ? err.message : 'Could not place the test here',
        });
      }
    }

    return NextResponse.json(
      {
        data: {
          test_id: result.test_id,
          folder_id: result.folder_id,
          question_count: result.question_count,
          created: result.created,
          reused: result.reused,
          skipped: result.skipped,
          placements,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Failed to publish the test';
    console.error('Test publish error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

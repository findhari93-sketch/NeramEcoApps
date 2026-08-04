import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { commitImport, ImportInputError, type CommitRow } from '@/lib/qb-import-service';
import { saveTestImportPayload } from '@/lib/test-import-store';

/**
 * POST /api/question-bank/import/commit   (teacher/admin)
 *
 * Final step of the AI import. Writes the approved tags, the approved
 * questions, and composes the test in one call.
 *
 * Body:
 * {
 *   title, folder_id?, folder_path?: string[],
 *   timer_type?, duration_minutes?, per_question_seconds?, passing_pct?, is_published?,
 *   questions_to_serve?,                           // pool: ask fewer than the test holds
 *   new_tags?: [{ slug, label }],                  // theme tags the teacher approved
 *   extra_question_ids?: string[],                 // bank questions added alongside the import
 *   source?: 'paste' | 'file_upload',              // how the JSON arrived, recorded with it
 *   questions: [{
 *     action: 'create' | 'reuse' | 'merge' | 'replace' | 'keep_both' | 'skip',
 *     existing_question_id?,                       // required for every duplicate action
 *     use_in_test?: 'new' | 'existing',            // only read for keep_both
 *     question_text, question_format, options, correct_answer, explanation,
 *     difficulty, exam_relevance, tag_ids?, new_tag_slugs?
 *   }]
 * }
 *
 * The writes themselves live in lib/qb-import-service, shared with the chapter
 * generator so both build a test the same way.
 */

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    // Gated on the staff tier, not user_type: a manager row is
    // user_type='student' with staff_role='manager'.
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can import questions' }, { status: 403 });
    }
    const callerId = access.caller.id;

    const body = await request.json();
    const rows: CommitRow[] = Array.isArray(body?.questions) ? body.questions : [];

    const result = await commitImport({
      title: typeof body?.title === 'string' ? body.title : '',
      callerId,
      rows,
      newTags: Array.isArray(body?.new_tags) ? body.new_tags : [],
      extraQuestionIds: Array.isArray(body?.extra_question_ids) ? body.extra_question_ids : [],
      folderId: typeof body?.folder_id === 'string' ? body.folder_id : null,
      folderPath: Array.isArray(body?.folder_path) ? body.folder_path : null,
      testKind: body?.test_kind,
      timerType: body?.timer_type,
      durationMinutes: body?.duration_minutes ?? null,
      perQuestionSeconds: body?.per_question_seconds ?? null,
      passingPct: body?.passing_pct ?? null,
      isPublished: body?.is_published ?? false,
      questionsToServe: body?.questions_to_serve ?? null,
      createdFrom: 'ai_import',
    });

    // Keep the paper the test was built from, so it can be downloaded, edited
    // and handed back. Best-effort: losing the archive copy is worth far less
    // than the test that was just created successfully.
    await saveTestImportPayload({
      testId: result.test_id,
      questionIds: result.question_ids,
      source: body?.source === 'file_upload' ? 'file_upload' : 'paste',
      createdBy: callerId,
      promptMeta: {
        title: typeof body?.title === 'string' ? body.title.trim() : '',
        questions_to_serve: body?.questions_to_serve ?? null,
        folder_path: Array.isArray(body?.folder_path) ? body.folder_path : null,
      },
    }).catch((err) => console.error('Could not archive the import payload:', err));

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Failed to import questions';
    console.error('QB import commit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

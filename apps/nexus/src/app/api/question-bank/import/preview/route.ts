import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { dedupeImportRows } from '@/lib/qb-import-service';

/**
 * POST /api/question-bank/import/preview   (teacher/admin)
 *
 * Second step of the AI import: the wizard has already parsed the paste
 * client-side, so this route only answers "have we got these already?".
 *
 * Body: { questions: [{ key, question_text, exam_relevance? }] }
 * Returns one verdict per question with a SUGGESTED action, which the review
 * screen preselects. The teacher can override every one of them; nothing here
 * writes anything.
 *
 * The scan itself lives in lib/qb-import-service, because the chapter generator
 * runs the same dedupe without ever making an HTTP request.
 */

export type { ImportAction } from '@/lib/qb-import-service';

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    // Gated on the staff tier, not user_type: a manager row is
    // user_type='student' with staff_role='manager'.
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can import questions' }, { status: 403 });
    }

    const body = await request.json();
    const rows = Array.isArray(body?.questions) ? body.questions : null;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'questions must be a non-empty array' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Import at most 200 questions at a time' }, { status: 400 });
    }

    return NextResponse.json({ data: await dedupeImportRows(rows) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check for duplicates';
    console.error('QB import preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

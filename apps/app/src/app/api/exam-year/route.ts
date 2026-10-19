export const dynamic = 'force-dynamic';

/**
 * /api/exam-year: the "Which year will you write NATA or JEE B.Arch?" sheet.
 *
 * GET  -> { year, source, promptDue, choices } for the signed-in student.
 *         promptDue is false once a batch or stated year exists, and while a
 *         "Later" / "Not sure yet" snooze is running.
 * POST { action: 'save', year }        -> records the year (source tools_sheet)
 * POST { action: 'later' | 'not_sure' } -> snoozes the sheet (users.metadata)
 *
 * /api/exam-details is not reused: its POST requires a full NATA status and
 * rewrites the exam attempts, which a one-tap year answer must not do.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getExamYearStatus,
  recordStatedExamYear,
  snoozeExamYearPromptForUser,
  examYearChoices,
} from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    const supabase = getSupabaseAdminClient() as any;
    const { data } = await supabase.from('users').select('id').eq('firebase_uid', decoded.uid).maybeSingle();
    return (data as { id: string } | null)?.id || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const status = await getExamYearStatus(getSupabaseAdminClient(), userId);
    return NextResponse.json(
      { year: status.year, source: status.source, promptDue: status.promptDue, choices: examYearChoices() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('exam-year GET failed:', err);
    // Never let a failed check pop the sheet.
    return NextResponse.json({ error: 'Could not load your exam year' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { action?: unknown; year?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  try {
    if (body.action === 'later' || body.action === 'not_sure') {
      await snoozeExamYearPromptForUser(supabase, userId, body.action);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'save') {
      const result = await recordStatedExamYear(supabase, userId, body.year, 'tools_sheet');
      if (result.saved) return NextResponse.json({ ok: true, year: result.year });
      if (result.reason === 'invalid_year') {
        return NextResponse.json({ error: 'Please pick one of the years shown.' }, { status: 400 });
      }
      if (result.reason === 'batch') {
        // Their class already fixes the year: nothing to ask, nothing to save.
        return NextResponse.json({ ok: true, kept: 'batch' });
      }
      console.error('exam-year save failed:', result);
      return NextResponse.json({ error: 'We could not save that. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('exam-year POST failed:', err);
    return NextResponse.json({ error: 'We could not save that. Please try again.' }, { status: 500 });
  }
}

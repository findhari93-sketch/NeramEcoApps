import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  confirmRecordCheck,
  createAdminNotification,
  createFeeCorrectionReport,
  getLatestRecordCheck,
  getOpenFeeCorrection,
  loadStudentFeeState,
  markRecordCheckOpened,
  PENDING_FOR_STUDENT,
  type RecordCheckRow,
} from '@neram/database/queries';
import { feeSignature, validateCorrection, type FeeView } from '@neram/database/fee-plan';
import { sendStaffPush } from '@neram/database/staff-push';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET  /api/student/record-check   the office's "Check your details" ask, with fees
 * POST /api/student/record-check   { action: 'confirm' }
 *                                  { action: 'report', items, note }
 *
 * The student is identified by their Microsoft sign-in, exactly as
 * /api/student/profile-completion does. Their personal details are read and
 * saved through that route (the single writer for a student's own details);
 * this one is only about the check and the fees.
 *
 * Fees are returned only while a check exists: staff decide when a student sees
 * money. The first GET stamps opened_at. A teacher using View as Student can
 * look but cannot confirm or report, and does not count as the student opening it.
 *
 * Mutations, and a per-student read, so a route is right; the page caches it in SWR.
 */

export const dynamic = 'force-dynamic';

const LIVE_FOR_PAGE = new Set(['queued', 'sent', 'opened', 'confirmed', 'correction_reported', 'changed']);
/** The student may report a problem while the ask is open, and after confirming. */
const MAY_REPORT = new Set([...PENDING_FOR_STUDENT, 'confirmed', 'correction_reported']);

interface Student {
  id: string;
  name: string | null;
}

async function studentFor(request: NextRequest, supabase: any) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const { data: user, error } = await supabase.from('users').select('id, name').eq('ms_oid', msUser.oid).maybeSingle();
  if (error) throw error;
  return { user: (user as Student | null) ?? null, impersonated: Boolean(msUser.impersonatorUserId) };
}

function checkView(check: RecordCheckRow) {
  return {
    id: check.id,
    status: check.status,
    sentAt: check.sent_at,
    openedAt: check.opened_at,
    confirmedAt: check.confirmed_at,
  };
}

/** The page's whole state for one student. */
async function pageState(supabase: any, userId: string, check: RecordCheckRow | null) {
  if (!check || !LIVE_FOR_PAGE.has(check.status)) return { check: null, fees: null };
  const [state, openReport, lastResolved] = await Promise.all([
    loadStudentFeeState(supabase, userId),
    getOpenFeeCorrection(supabase, userId),
    supabase
      .from('fee_correction_reports')
      .select('status, resolution_note, resolved_at')
      .eq('check_id', check.id)
      .neq('status', 'open')
      .order('resolved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const view: FeeView = state.view;
  const resolved = lastResolved?.data ?? null;
  return {
    check: checkView(check),
    fees: {
      ...view,
      openReport: openReport
        ? { note: openReport.note, items: openReport.items, createdAt: openReport.created_at }
        : null,
      // The office's last answer to a report on this check, so a rejected one
      // is explained on the page as well as in the message.
      lastAnswer:
        resolved && resolved.resolution_note !== 'Replaced by a newer report from the student.'
          ? { status: resolved.status, note: resolved.resolution_note, at: resolved.resolved_at }
          : null,
    },
  };
}

function failure(error: unknown, fallback: string) {
  console.error('[student/record-check]', error instanceof Error ? error.message : error);
  // 401 for a missing or bad token, 503 when Microsoft cannot answer, never a
  // blanket 500 (lib/api-errors.ts).
  return errorResponse(error, fallback);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { user, impersonated } = await studentFor(request, supabase);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let check = await getLatestRecordCheck(supabase, user.id);
    if (check && !impersonated && LIVE_FOR_PAGE.has(check.status)) {
      check = await markRecordCheckOpened(supabase, check);
    }
    return NextResponse.json(await pageState(supabase, user.id, check));
  } catch (error) {
    return failure(error, 'Could not load your details');
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { user, impersonated } = await studentFor(request, supabase);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (impersonated) {
      return NextResponse.json({ error: 'Only the student can answer this. You are viewing as them.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const check = await getLatestRecordCheck(supabase, user.id);
    if (!check || !LIVE_FOR_PAGE.has(check.status)) {
      return NextResponse.json({ error: 'There is nothing to check right now.' }, { status: 409 });
    }
    const name = user.name || 'A student';
    const crmLink = `/crm/${user.id}?section=application`;

    if (body.action === 'confirm') {
      if (!PENDING_FOR_STUDENT.includes(check.status)) {
        return NextResponse.json(
          {
            error:
              check.status === 'confirmed'
                ? 'You have already confirmed these fees.'
                : 'Your report is with the office. We will tell you when it is checked.',
          },
          { status: 409 },
        );
      }
      const state = await loadStudentFeeState(supabase, user.id);
      await confirmRecordCheck(supabase, check.id, state.view, feeSignature(state.view));
      try {
        await createAdminNotification(
          {
            event_type: 'fee_details_confirmed',
            title: `${name} confirmed their fees`,
            message: 'They checked their details and fees in Nexus and said everything is correct.',
            metadata: { user_id: user.id, check_id: check.id, link: crmLink, source_app: 'nexus' },
          },
          supabase,
        );
      } catch (notifyError: any) {
        // The confirmation is saved; the bell is a courtesy.
        console.warn('[student/record-check] staff bell not written:', notifyError?.message);
      }
      return NextResponse.json(await pageState(supabase, user.id, await getLatestRecordCheck(supabase, user.id)));
    }

    if (body.action === 'report') {
      if (!MAY_REPORT.has(check.status)) {
        return NextResponse.json({ error: 'There is nothing to check right now.' }, { status: 409 });
      }
      const parsed = validateCorrection({ items: body.items, note: body.note });
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

      const report = await createFeeCorrectionReport(supabase, {
        check,
        items: parsed.items.map((i) => ({ ...i, reference: i.reference ?? null })),
        note: parsed.note,
      });
      const summary = parsed.items.length
        ? `${parsed.items.length} payment${parsed.items.length === 1 ? '' : 's'} reported. ${parsed.note}`
        : parsed.note;
      try {
        await createAdminNotification(
          {
            event_type: 'fee_correction_reported',
            title: `${name} says their fees are wrong`,
            message: summary.slice(0, 300),
            metadata: {
              user_id: user.id,
              report_id: report.id,
              check_id: check.id,
              link: '/collections?tab=reports',
              source_app: 'nexus',
            },
          },
          supabase,
        );
      } catch (notifyError: any) {
        console.warn('[student/record-check] staff bell not written:', notifyError?.message);
      }
      // Never throws; a missing VAPID key just means no phone alert.
      await sendStaffPush(supabase, {
        title: `${name} says their fees are wrong`,
        body: summary.slice(0, 140),
        url: '/collections?tab=reports',
        tag: `fee-report-${user.id}`,
      });
      return NextResponse.json(await pageState(supabase, user.id, await getLatestRecordCheck(supabase, user.id)));
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return failure(error, 'Could not save that');
  }
}

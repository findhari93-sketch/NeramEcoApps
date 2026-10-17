export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  buildCollections,
  currentAcademicYear,
  getCurrentBatch,
  fetchAllRows,
  ACADEMIC_YEAR_REGEX,
} from '@neram/database';

/**
 * GET /api/collections?year=2026-27 (or year=none for students with no year)
 *
 * Who owes what for one academic year: that year's students, their fee lead,
 * paid payments, installments, open fee reports and latest checks, worked out by
 * buildCollections (the same rules as the form and the reminders). Around 100
 * students per year, computed in JS. Ids are chunked (URL length) and every read
 * pages past PostgREST's 1,000-row cap.
 */

const CHUNK = 150;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function readIn(sb: any, table: string, columns: string, column: string, ids: string[], extra?: (q: any) => any) {
  if (!ids.length) return [];
  const parts = await Promise.all(
    chunks(ids).map((part) =>
      fetchAllRows<any>(() => {
        let q = sb.from(table).select(columns).in(column, part);
        if (extra) q = extra(q);
        return q.order('id', { ascending: true });
      }),
    ),
  );
  return parts.flat();
}

const LEAD_COLUMNS =
  'id, user_id, created_at, source, application_number, reviewed_by, applicant_category, academic_data, assigned_fee, discount_amount, final_fee, full_payment_discount, allowed_payment_modes, payment_scheme, installment_1_amount, installment_2_amount';

export async function GET(request: NextRequest) {
  try {
    const sb: any = createAdminClient();

    let defaultYear = currentAcademicYear();
    try {
      const batch = await getCurrentBatch(sb);
      if (batch?.code && ACADEMIC_YEAR_REGEX.test(batch.code)) defaultYear = batch.code;
    } catch {
      // No registry row: the April to March calendar year is the fallback.
    }
    const asked = request.nextUrl.searchParams.get('year') || '';
    const year = asked === 'none' || ACADEMIC_YEAR_REGEX.test(asked) ? asked : defaultYear;

    // Every student's year, for the picker. One column, paged.
    const allYears = await fetchAllRows<any>(() =>
      sb.from('users').select('id, academic_year').eq('user_type', 'student').order('id', { ascending: true }),
    );
    const yearSet = new Set<string>([defaultYear]);
    let hasNoYear = false;
    for (const r of allYears) {
      if (r.academic_year) yearSet.add(r.academic_year);
      else hasNoYear = true;
    }
    const years = [...yearSet].sort((a, b) => b.localeCompare(a));

    const users = await fetchAllRows<any>(() => {
      let q = sb
        .from('users')
        .select('id, name, email, phone, academic_year, is_alumni')
        .eq('user_type', 'student')
        // Hide synthetic E2E accounts (same guard as the Students hub).
        .or('email.is.null,email.not.ilike.e2e-*');
      q = year === 'none' ? q.is('academic_year', null) : q.eq('academic_year', year);
      return q.order('id', { ascending: true });
    });
    const userIds = users.map((u: any) => u.id as string);

    const [leads, payments, reports, checks] = await Promise.all([
      readIn(sb, 'lead_profiles', LEAD_COLUMNS, 'user_id', userIds, (q) => q.is('deleted_at', null)),
      readIn(
        sb,
        'payments',
        'id, user_id, amount, status, paid_at, created_at, installment_number, payment_method',
        'user_id',
        userIds,
        (q) => q.eq('status', 'paid'),
      ),
      readIn(sb, 'fee_correction_reports', 'id, user_id, created_at, items, note', 'user_id', userIds, (q) => q.eq('status', 'open')),
      readIn(sb, 'student_record_checks', 'id, user_id, status, created_at, sent_at, opened_at, confirmed_at, send_channel', 'user_id', userIds, (q) =>
        q.neq('status', 'superseded'),
      ),
    ]);
    const installments = await readIn(
      sb,
      'payment_installments',
      'id, lead_profile_id, installment_number, amount, due_date, status, paid_at, paid_amount, payment_id',
      'lead_profile_id',
      leads.map((l: any) => l.id),
    );

    const { rows, totals } = buildCollections({
      students: users.map((u: any) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        academicYear: u.academic_year,
        isAlumni: Boolean(u.is_alumni),
      })),
      leads,
      payments,
      installments,
      openReports: reports,
      checks,
    });

    // The newest check per student, with its dates, for the Checks tab.
    const latestCheck = new Map<string, any>();
    for (const c of [...checks].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))) {
      if (!latestCheck.has(c.user_id)) latestCheck.set(c.user_id, c);
    }

    return NextResponse.json({
      year,
      defaultYear,
      years,
      hasNoYear,
      rows: rows.map((r) => {
        const c = latestCheck.get(r.userId);
        return {
          ...r,
          check: c
            ? { id: c.id, status: c.status, createdAt: c.created_at, sentAt: c.sent_at, openedAt: c.opened_at, confirmedAt: c.confirmed_at, channel: c.send_channel }
            : null,
        };
      }),
      reports: reports.map((r: any) => ({ id: r.id, userId: r.user_id, createdAt: r.created_at, items: r.items || [], note: r.note })),
      totals,
    });
  } catch (err: any) {
    console.error('[collections] GET failed:', err?.message);
    return NextResponse.json({ error: 'Could not load collections.' }, { status: 500 });
  }
}

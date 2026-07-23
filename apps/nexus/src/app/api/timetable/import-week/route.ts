import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * Commit a reviewed week import.
 *
 * Parsing and correction happen client-side (see lib/week-import.ts and the
 * import page), so by the time a request reaches here the teacher has already
 * seen every row. This route re-validates anyway, because a client is not a
 * trust boundary, then writes classes as DRAFTS.
 *
 * Drafts, never published: importing a file should not push a week to students
 * before anyone has looked at it in the planner. Publishing is a separate,
 * deliberate action.
 */

interface IncomingEntry {
  kind?: string;
  date?: string;
  title?: string;
  startTime?: string | null;
  endTime?: string | null;
  teacherName?: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * GET /api/timetable/import-week?template=1&week_start=YYYY-MM-DD
 *
 * The blank the upload screen asks for. "Drop an .xlsx here" with no template
 * is a guessing game, and the parser's tolerance for odd headers is invisible
 * to someone staring at an empty spreadsheet.
 *
 * Headers use the canonical names from lib/week-import.ts. The parser accepts
 * many aliases, so an existing file usually imports untouched; this is the
 * shape to copy when starting from nothing.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const weekStart = request.nextUrl.searchParams.get('week_start');
    const monday = ISO_DATE.test(weekStart || '') ? weekStart! : nextMonday();
    const day = (offset: number) => addDays(monday, offset);

    const XLSX = await import('xlsx');
    const rows = [
      ['Date', 'Class', 'Start time', 'End time', 'Teacher', 'Holiday'],
      [day(0), 'Aptitude, perspective basics', '19:00', '20:00', '', ''],
      [day(1), 'Mathematics, mensuration', '19:00', '20:00', '', ''],
      [day(2), 'Independence Day', '', '', '', 'Yes'],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 10 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Week');

    // 'array' yields an ArrayBuffer, which is what the Response body accepts;
    // the same shape the study-materials download route returns.
    const body: ArrayBuffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' });

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `attachment; filename="neram-week-${monday}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Dates are built in IST so a template made late at night is not off by one. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMonday(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const iso = ist.toISOString().slice(0, 10);
  // getUTCDay on the IST-shifted date gives the IST weekday. Sunday is 0.
  const dow = ist.getUTCDay();
  return addDays(iso, dow === 1 ? 0 : (8 - dow) % 7);
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id, entries } = await request.json();

    if (!classroom_id || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'Missing classroom_id or entries' }, { status: 400 });
    }
    if (entries.length === 0) {
      return NextResponse.json({ error: 'There is nothing to import' }, { status: 400 });
    }
    // A weekly schedule is a handful of rows. A payload far bigger than that is
    // a mistake or an abuse, and either way should not become hundreds of rows.
    if (entries.length > 200) {
      return NextResponse.json(
        { error: 'That file has too many rows for one week import (max 200).' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: classroom } = await supabase
      .from('nexus_classrooms')
      .select('is_archived')
      .eq('id', classroom_id)
      .single();
    if (classroom?.is_archived) {
      return NextResponse.json(
        { error: 'This classroom is archived and read-only' },
        { status: 409 },
      );
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can import a week' }, { status: 403 });
    }

    // Re-validate. The client already filtered, but this is the trust boundary.
    const classes: Required<IncomingEntry>[] = [];
    const holidays: { date: string; title: string }[] = [];
    const rejected: { title: string; reason: string }[] = [];

    for (const raw of entries as IncomingEntry[]) {
      const date = String(raw?.date || '');
      const title = String(raw?.title || '').trim();

      if (!ISO_DATE.test(date)) {
        rejected.push({ title: title || '(untitled)', reason: 'Invalid date' });
        continue;
      }

      if (raw?.kind === 'holiday') {
        holidays.push({ date, title: title || 'Holiday' });
        continue;
      }

      const startTime = String(raw?.startTime || '');
      const endTime = String(raw?.endTime || '');
      if (!title) {
        rejected.push({ title: '(untitled)', reason: 'No title' });
        continue;
      }
      if (!HHMM.test(startTime) || !HHMM.test(endTime)) {
        rejected.push({ title, reason: 'Invalid time' });
        continue;
      }
      if (endTime <= startTime) {
        rejected.push({ title, reason: 'Ends before it starts' });
        continue;
      }

      classes.push({
        kind: 'class',
        date,
        title,
        startTime,
        endTime,
        teacherName: raw?.teacherName ? String(raw.teacherName).trim() : null,
      });
    }

    // Resolve teacher names to real users, in one query rather than per row.
    // An unmatched name falls back to the importing teacher, so a typo in the
    // spreadsheet never blocks the import.
    const teacherIdByName = new Map<string, string>();
    const wantedNames = [...new Set(classes.map((c) => c.teacherName).filter(Boolean))] as string[];
    if (wantedNames.length > 0) {
      const { data: staff } = await supabase
        .from('users')
        .select('id, name')
        .in('user_type', ['teacher', 'admin']);
      for (const name of wantedNames) {
        const needle = name.toLowerCase().replace(/^(ar|dr|mr|mrs|ms)\.?\s+/i, '').trim();
        const hit = (staff || []).find((s: any) => {
          const known = String(s.name || '').toLowerCase();
          return known === needle || known.includes(needle) || needle.includes(known);
        });
        if (hit) teacherIdByName.set(name, hit.id);
      }
    }

    // Skip anything already sitting in that slot, so re-importing a corrected
    // file does not duplicate the classes that were already fine.
    const dates = [...new Set(classes.map((c) => c.date))].sort();
    let existing: { scheduled_date: string; start_time: string }[] = [];
    if (dates.length > 0) {
      const { data } = await supabase
        .from('nexus_scheduled_classes')
        .select('scheduled_date, start_time')
        .eq('classroom_id', classroom_id)
        .gte('scheduled_date', dates[0])
        .lte('scheduled_date', dates[dates.length - 1])
        .neq('status', 'cancelled');
      existing = data || [];
    }
    const takenSlots = new Set(
      existing.map((c) => `${c.scheduled_date} ${String(c.start_time).slice(0, 5)}`),
    );

    const toInsert = classes.filter((c) => !takenSlots.has(`${c.date} ${c.startTime}`));
    const skipped = classes.length - toInsert.length;

    let imported = 0;
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('nexus_scheduled_classes')
        .insert(
          toInsert.map((c) => ({
            classroom_id,
            title: c.title,
            scheduled_date: c.date,
            start_time: c.startTime,
            end_time: c.endTime,
            teacher_id: (c.teacherName && teacherIdByName.get(c.teacherName)) || user.id,
            organizer_name: c.teacherName,
            status: 'scheduled',
            target_scope: 'classroom',
            // Imported weeks land as drafts, awaiting a deliberate publish.
            publish_state: 'draft',
            published_at: null,
          })),
        )
        .select('id');

      if (error) throw error;
      imported = (data || []).length;
    }

    let holidaysAdded = 0;
    if (holidays.length > 0) {
      // The table has a UNIQUE(classroom_id, holiday_date), so re-importing the
      // same file updates rather than erroring.
      const { data, error } = await supabase
        .from('nexus_classroom_holidays')
        .upsert(
          holidays.map((h) => ({
            classroom_id,
            holiday_date: h.date,
            title: h.title,
            created_by: user.id,
          })),
          { onConflict: 'classroom_id,holiday_date' },
        )
        .select('id');

      if (!error) holidaysAdded = (data || []).length;
    }

    return NextResponse.json({
      imported,
      holidaysAdded,
      skipped,
      rejected,
      unmatchedTeachers: wantedNames.filter((n) => !teacherIdByName.has(n)),
      message:
        imported > 0
          ? `Imported ${imported} ${imported === 1 ? 'class' : 'classes'} as drafts. Review the week, then publish.`
          : 'Nothing new to import. Every class in this file already exists.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import the week';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

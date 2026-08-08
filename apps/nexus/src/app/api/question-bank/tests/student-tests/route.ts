import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { fetchAllRows, getSupabaseAdminClient } from '@neram/database';

/** Attempt rows are read in full so every status can be tallied, not just one. */
interface AttemptRow {
  test_id: string;
  status: string | null;
  mode: string | null;
  percentage: number | string | null;
  abandon_reason_code: string | null;
  abandon_reason_note: string | null;
}

/** A student saying why a paper did not get done, from either storage site. */
interface ReasonRow {
  test_id: string;
  reason_code: string | null;
  reason_note: string | null;
  /** 'abandoned' means they started and stopped; 'skipped' means they never did. */
  kind: 'abandoned' | 'skipped';
}

/**
 * GET /api/question-bank/tests/student-tests   (staff)
 *
 * Papers students built for themselves, grouped by student.
 *
 * Read only, but no longer on the grounds that a teacher may not touch these at
 * all. That was the earlier rule and it has been deliberately narrowed: staff
 * CAN now delete a student's practice paper, through
 * POST /api/question-bank/tests/bulk-delete, because the papers students
 * abandon by the dozen are exactly the clutter teachers were asked to clear.
 *
 * What survives of the old rule, and is enforced in /api/test-folders: staff may
 * delete a student's paper, never re-file one. Deleting is housekeeping;
 * rearranging someone's folders behind their back is not.
 *
 * So this route stays a GET. The one write is the shared delete route, which
 * records who pressed it in nexus_tests.deleted_by.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see student tests' }, { status: 403 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const search = (new URL(request.url).searchParams.get('search') || '').trim();

    let query = supabase
      .from('nexus_tests')
      .select('id, title, created_by_student, created_at, folder_id, created_from, content_summary, source_filters')
      .eq('test_kind', 'student_custom')
      .eq('is_active', true)
      .not('created_by_student', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300);
    if (search) {
      query = query.ilike('title', `%${search.replace(/[%_]/g, (m: string) => `\\${m}`)}%`);
    }

    const { data: tests, error } = await query;
    if (error) throw error;
    const allRows = tests || [];
    if (allRows.length === 0) return NextResponse.json({ data: { groups: [] } });

    // `name` is the display name on users. Selecting a column that does not
    // exist makes PostgREST reject the whole request, and because this result
    // was previously destructured without its error, the rejection was
    // swallowed and every single row rendered as "Unknown student".
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, name, avatar_url, is_alumni')
      .in('id', [...new Set(allRows.map((t: any) => t.created_by_student))]);

    // Loud rather than degraded. A name lookup that fails should read as broken,
    // not as a roomful of anonymous students.
    if (userError) throw userError;

    const userMap = new Map<string, { name: string | null; avatar_url: string | null; is_alumni: boolean }>(
      (users || []).map((u: any) => [
        u.id,
        { name: u.name ?? null, avatar_url: u.avatar_url ?? null, is_alumni: u.is_alumni === true },
      ]),
    );

    /**
     * Study stage and participation, so a name is never shown on its own.
     *
     * A teacher reading "9 tries, none finished" needs to know whether that
     * student is a Class 11 who sits the exam next year or a Break Year student
     * sitting it in weeks, and whether they are dormant, in which case every
     * number beside their name is history rather than news.
     *
     * The most recently enrolled row wins when a student is in several
     * classrooms, which is the classroom they are actually working in. Soft
     * failure: losing the chips must not cost the teacher the list.
     */
    const stateByStudent = new Map<string, any>();
    try {
      const { data: enrolments } = await supabase
        .from('nexus_enrollments')
        .select('user_id, current_standard, participation_status, dormant_since, dormant_reason, enrolled_at')
        .eq('role', 'student')
        .eq('is_active', true)
        .in('user_id', [...userMap.keys()])
        .order('enrolled_at', { ascending: false });
      for (const e of (enrolments || []) as any[]) {
        // A dormant row always wins over an active one: if a student is dormant
        // anywhere they are working in, saying nothing would be the misleading
        // half of the truth.
        const held = stateByStudent.get(e.user_id);
        if (!held || (e.participation_status === 'dormant' && held.participation_status !== 'dormant')) {
          stateByStudent.set(e.user_id, e);
        }
      }
    } catch {
      // Chips are a nicety. The list is not.
    }

    // Graduated students are dropped, matching what loadClassroomRoster already
    // does on every other Nexus surface. Their papers are historical: a teacher
    // scanning this tab is looking for students they can still act on, and six
    // alumni sitting in the list is six names that can only ever be noise.
    // A student with no users row at all is also dropped rather than rendered as
    // "Unknown student", which was never information anybody could use.
    const rows = allRows.filter((t: any) => {
      const u = userMap.get(t.created_by_student);
      return !!u && !u.is_alumni;
    });
    if (rows.length === 0) return NextResponse.json({ data: { groups: [] } });

    const testIds = rows.map((t: any) => t.id);

    const [tqRows, attempts, skips, { data: folders }] = await Promise.all([
      // Read to exhaustion. `.range(0, 100000)` reads as "everything" but
      // PostgREST caps a response at 1000 rows and reports neither an error nor
      // the truncation, so this tally used to be a count of whichever page
      // arrived: on production it showed 0 questions for six papers holding 20
      // to 49, and 4 questions for a paper holding 27.
      fetchAllRows<{ test_id: string }>(() =>
        supabase.from('nexus_test_questions').select('test_id').in('test_id', testIds),
      ),
      // EVERY status, not just 'submitted'. Counting submissions alone reported
      // "0 attempts" for a paper that had been opened nine times and abandoned
      // nine times, which reads as a student ignoring their own test when it is
      // in fact a student unable to finish it. The distinction is the whole
      // point of this column.
      fetchAllRows<AttemptRow>(() =>
        supabase
          .from('nexus_test_attempts')
          .select('test_id, status, mode, percentage, abandon_reason_code, abandon_reason_note')
          .in('test_id', testIds),
      ),
      // "I am not going to do this" lives in its own table, because there is no
      // attempt row to hang it on. Soft-failed: a teacher must not lose the
      // whole list because one optional column is not there yet on an
      // environment where 20260824090100 has not landed.
      fetchAllRows<any>(() =>
        supabase
          .from('nexus_test_skip_reasons')
          .select('test_id, reason_code, reason_note')
          .in('test_id', testIds),
      ).catch(() => [] as any[]),
      supabase.from('nexus_test_folders').select('id, name').in('id', rows.map((t: any) => t.folder_id).filter(Boolean)),
    ]);

    const folderMap = new Map((folders || []).map((f: any) => [f.id, f.name]));
    const qCount = new Map<string, number>();
    for (const r of tqRows) qCount.set(r.test_id, (qCount.get(r.test_id) || 0) + 1);

    // Every reason a student gave about these papers, from both storage sites,
    // keyed by test. `kind` is kept because the two are genuinely different
    // signals: "I started and stopped" is a stronger complaint about the paper
    // than "I never started".
    const reasonsByTest = new Map<string, ReasonRow[]>();
    const addReason = (r: ReasonRow) => {
      if (!r.reason_code) return;
      reasonsByTest.set(r.test_id, [...(reasonsByTest.get(r.test_id) || []), r]);
    };
    for (const s of skips || []) {
      addReason({ test_id: s.test_id, reason_code: s.reason_code, reason_note: s.reason_note, kind: 'skipped' });
    }

    const best = new Map<string, number>();
    const tally = new Map<string, { submitted: number; in_progress: number; abandoned: number; total: number }>();
    for (const a of attempts) {
      if (a.abandon_reason_code) {
        addReason({
          test_id: a.test_id,
          reason_code: a.abandon_reason_code,
          reason_note: a.abandon_reason_note,
          kind: 'abandoned',
        });
      }
      const t = tally.get(a.test_id) || { submitted: 0, in_progress: 0, abandoned: 0, total: 0 };
      t.total += 1;
      if (a.status === 'submitted' || a.status === 'graded') t.submitted += 1;
      else if (a.status === 'in_progress') t.in_progress += 1;
      else if (a.status === 'abandoned' || a.status === 'expired') t.abandoned += 1;
      tally.set(a.test_id, t);

      // Official submissions only for the reported score: a revision run must
      // not move what a teacher sees as this student's result.
      if (a.status !== 'submitted' || a.mode !== 'official') continue;
      const pct = a.percentage == null ? null : Number(a.percentage);
      if (pct != null && !Number.isNaN(pct)) best.set(a.test_id, Math.max(best.get(a.test_id) ?? 0, pct));
    }

    const groups = new Map<string, any>();
    for (const t of rows as any[]) {
      const key = t.created_by_student;
      if (!groups.has(key)) {
        const u = userMap.get(key);
        const state = stateByStudent.get(key);
        groups.set(key, {
          student_id: key,
          student_name: u?.name?.trim() || 'Unknown student',
          avatar_url: u?.avatar_url ?? null,
          // The two orthogonal axes from nexus_enrollments. Sent even when null,
          // because "Not set" is a fact a teacher can act on and hiding it is
          // how nineteen students ended up with no recorded stage.
          current_standard: state?.current_standard ?? null,
          participation_status: state?.participation_status ?? 'active',
          dormant_since: state?.dormant_since ?? null,
          dormant_reason: state?.dormant_reason ?? null,
          tests: [],
        });
      }
      const counts = tally.get(t.id) || { submitted: 0, in_progress: 0, abandoned: 0, total: 0 };
      groups.get(key).tests.push({
        id: t.id,
        title: t.title,
        folder_name: t.folder_id ? folderMap.get(t.folder_id) ?? null : null,
        // A "Fix my mistakes" paper is a different signal from a chosen topic
        // drill, so the two are distinguishable rather than blended.
        from_mistakes: t.created_from === 'mistakes',
        question_count: qCount.get(t.id) || 0,
        // `attempts` stays the count of FINISHED sittings so existing readers
        // keep their meaning, and the unfinished ones travel beside it rather
        // than being folded in and losing what makes them worth seeing.
        attempts: counts.submitted,
        attempts_started: counts.total,
        attempts_unfinished: counts.in_progress + counts.abandoned,
        best_percentage: best.get(t.id) ?? null,
        created_at: t.created_at,
        // What the paper holds, and what its author went looking for. The first
        // is derived and therefore present on every row including the 28 built
        // before any of this existed; the second is NULL on all of those,
        // because nothing recorded it. The UI must show that difference rather
        // than paper over it. See migration 20260824090000.
        content_summary: t.content_summary ?? null,
        source_filters: t.source_filters ?? null,
        // What students said about this paper. The UI decides what to do with a
        // 'technical_problem' among them; the route just reports faithfully.
        reasons: reasonsByTest.get(t.id) || [],
      });
    }

    // Human labels for the category slugs that actually appear, resolved once
    // here rather than by every client fetching the whole tag tree. Only the
    // slugs in play are looked up, so this stays a small query however large the
    // registry grows. A slug with no row falls back to a humanised form in the
    // UI, so a missing label is never a blank.
    const slugs = [
      ...new Set(
        rows.flatMap((t: any) => ((t.content_summary?.categories || []) as any[]).map((c) => c?.slug)).filter(Boolean),
      ),
    ];
    const categoryLabels: Record<string, string> = {};
    if (slugs.length > 0) {
      const { data: tags } = await supabase.from('nexus_qb_tags').select('slug, label').in('slug', slugs);
      for (const tag of tags || []) categoryLabels[tag.slug] = tag.label;
    }

    return NextResponse.json({
      data: {
        groups: [...groups.values()].sort((a, b) => String(a.student_name).localeCompare(String(b.student_name))),
        category_labels: categoryLabels,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student tests';
    console.error('Student tests list error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/review-requests/batch?batch=2025-26
 *
 * One batch of students, prefilled from what we already hold, for the "Add a
 * batch" dialog on Review requests. Staff should never retype a name, photo,
 * phone, city or exam year: those come from the account and the application
 * form. Only the exam result (AIR or percentile, and the college when no record
 * has it) is left for staff, and the rows say which ones still need it.
 *
 * With no batch, defaults to the one before the current batch, because the
 * students asked for reviews are last year's. Students who already have a live
 * review link come back marked, so nobody is sent a second one.
 *
 * Staff only (admin API middleware). Low volume, no caching.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllRows,
  getCurrentBatch,
  getSupabaseAdminClient,
  listAcademicBatches,
  listStudentsByYear,
  reviewRequestProgress,
} from '@neram/database';
import { previousCohort, toBatchRow } from '@/lib/review-requests-view';

const NO_STORE = { 'Cache-Control': 'no-store' };
// PostgREST puts .in() values in the URL; past ~300 uuids the request fails.
const ID_CHUNK = 200;
const COHORT = /^\d{4}-\d{2}$/;

function chunks<T>(list: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Rows for many user ids, chunked for the URL and paged past the 1,000-row cap. */
async function byUserIds<T extends { user_id: string }>(
  ids: string[],
  query: (ids: string[]) => any,
): Promise<Map<string, T>> {
  const parts = await Promise.all(chunks(ids).map((part) => fetchAllRows(() => query(part))));
  const map = new Map<string, T>();
  // Queries are ordered newest first, so the first row seen for a user is the one that counts.
  for (const row of parts.flat() as T[]) if (!map.has(row.user_id)) map.set(row.user_id, row);
  return map;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdminClient() as any;
  try {
    const [batches, current] = await Promise.all([
      listAcademicBatches(supabase).catch(() => []),
      getCurrentBatch(supabase).catch(() => null),
    ]);
    const asked = request.nextUrl.searchParams.get('batch');
    const batch = asked && COHORT.test(asked) ? asked : previousCohort(current?.code) || current?.code || null;
    const batchCodes = [...new Set([...(batches as Array<{ code: string }>).map((b) => b.code), ...(batch ? [batch] : [])])].sort((a, b) =>
      b.localeCompare(a),
    );
    if (!batch) return NextResponse.json({ batch: null, batches: batchCodes, centres: [], rows: [] }, { headers: NO_STORE });

    const [{ students }, { data: centreRows, error: centreError }] = await Promise.all([
      listStudentsByYear({ year: batch, status: 'all', program: 'architecture' }, supabase),
      supabase.from('offline_centers').select('id, name, city, center_type, google_place_id').eq('is_active', true).order('display_order', { ascending: true }),
    ]);
    if (centreError) throw centreError;
    const centres = (centreRows || []) as Array<{ id: string; name: string; city: string | null; center_type: string | null; google_place_id: string | null }>;
    const ids = students.map((s) => s.id);

    const [leads, alumni, results, links] = ids.length
      ? await Promise.all([
          byUserIds<any>(ids, (part) =>
            supabase
              .from('lead_profiles')
              .select('user_id, city, target_exam_year, interest_course, created_at')
              .in('user_id', part)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .order('id', { ascending: true }),
          ),
          byUserIds<any>(ids, (part) =>
            supabase.from('alumni_profiles').select('user_id, college_name, exam_name, created_at').in('user_id', part).order('created_at', { ascending: false }),
          ),
          byUserIds<any>(ids, (part) =>
            supabase
              .from('student_results')
              .select('id, user_id, exam_type, exam_year, rank, percentile, college_name, photo_url, created_at')
              .in('user_id', part)
              .order('created_at', { ascending: false }),
          ),
          byUserIds<any>(ids, (part) =>
            supabase
              .from('review_requests')
              .select('id, user_id, status, sent_at, opened_at, submitted_at, google_posted_self_reported_at, created_at')
              .in('user_id', part)
              .in('status', ['active', 'opened', 'submitted'])
              .order('created_at', { ascending: false }),
          ),
        ])
      : [new Map(), new Map(), new Map(), new Map()];

    const rows = students.map((s) => {
      const link = links.get(s.id);
      return toBatchRow({
        user: { id: s.id, name: s.name, avatar_url: s.avatar_url, phone: s.phone, academic_year: s.academic_year, is_alumni: s.is_alumni },
        lead: leads.get(s.id) ?? null,
        alumni: alumni.get(s.id) ?? null,
        result: results.get(s.id) ?? null,
        centres,
        existing: link ? { id: link.id, progress: reviewRequestProgress(link) } : null,
      });
    });

    return NextResponse.json(
      {
        batch,
        batches: batchCodes,
        centres: centres.map((c) => ({ id: c.id, name: c.name, city: c.city, center_type: c.center_type, has_place_id: Boolean(c.google_place_id) })),
        rows,
      },
      { headers: NO_STORE },
    );
  } catch (error: any) {
    console.error('[review-requests] batch', error?.message || error);
    return NextResponse.json({ error: 'Could not load this batch.' }, { status: 500, headers: NO_STORE });
  }
}

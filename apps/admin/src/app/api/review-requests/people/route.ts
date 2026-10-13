export const dynamic = 'force-dynamic';

/**
 * GET /api/review-requests/people?q=pri
 *
 * Finds a past student to prefill a review link from, in both places they can be:
 * a users row (with alumni and result details joined on) and a Student Results row
 * that never had an account. Ranked name start, word start, contains.
 *
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { examTypeFrom, examYearFromCohort, rankByName } from '@/lib/review-requests-view';

const NO_STORE = { 'Cache-Control': 'no-store' };

export interface ReviewPersonCandidate {
  key: string;
  name: string;
  source: 'user' | 'result';
  userId: string | null;
  studentResultId: string | null;
  photoUrl: string | null;
  phone: string | null;
  examType: 'NATA' | 'JEE_PAPER_2' | 'BOTH';
  examYear: number | null;
  airRank: number | null;
  percentile: number | null;
  score: number | null;
  collegeAdmitted: string | null;
  city: string | null;
  label: string;
}

const escapeIlike = (raw: string) => raw.replace(/[\\%_]/g, (c) => `\\${c}`);

const examFrom = (raw: string | null | undefined): ReviewPersonCandidate['examType'] => examTypeFrom(raw);

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ people: [] }, { headers: NO_STORE });
  const pattern = `%${escapeIlike(q)}%`;
  const supabase = getSupabaseAdminClient() as any;

  try {
    const [{ data: users }, { data: results }] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, avatar_url, phone, user_type, academic_year, is_alumni')
        .ilike('name', pattern)
        .in('user_type', ['student', 'lead'])
        .limit(40),
      supabase
        .from('student_results')
        .select('id, user_id, student_name, photo_url, exam_type, exam_year, rank, percentile, score, college_name, college_city')
        .ilike('student_name', pattern)
        .limit(40),
    ]);

    const userIds = (users || []).map((u: any) => u.id);
    const [{ data: alumni }, { data: leads }, { data: userResults }] = userIds.length
      ? await Promise.all([
          supabase.from('alumni_profiles').select('user_id, college_name, exam_name, exam_result').in('user_id', userIds),
          supabase.from('lead_profiles').select('user_id, city').in('user_id', userIds),
          supabase
            .from('student_results')
            .select('id, user_id, exam_type, exam_year, rank, percentile, score, college_name, photo_url')
            .in('user_id', userIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const byUser = <T extends { user_id: string }>(rows: T[] | null) => new Map((rows || []).map((r) => [r.user_id, r]));
    const alumniBy = byUser(alumni);
    const leadBy = byUser(leads);
    const resultBy = byUser(userResults);

    const people: ReviewPersonCandidate[] = [];
    for (const u of users || []) {
      const a: any = alumniBy.get(u.id);
      const r: any = resultBy.get(u.id);
      const yearFromCohort = examYearFromCohort(u.academic_year);
      people.push({
        key: `user:${u.id}`,
        name: u.name,
        source: 'user',
        userId: u.id,
        studentResultId: r?.id ?? null,
        photoUrl: r?.photo_url || u.avatar_url || null,
        phone: u.phone || null,
        examType: examFrom(r?.exam_type || a?.exam_name),
        examYear: r?.exam_year ?? yearFromCohort,
        airRank: r?.rank ?? null,
        percentile: r?.percentile ?? null,
        score: r?.score ?? null,
        collegeAdmitted: r?.college_name || a?.college_name || null,
        city: (leadBy.get(u.id) as any)?.city || null,
        label: [u.is_alumni ? 'Alumni' : u.user_type === 'student' ? 'Student' : 'Lead', u.academic_year].filter(Boolean).join(' · '),
      });
    }
    for (const r of results || []) {
      if (r.user_id && userIds.includes(r.user_id)) continue; // already listed with the account
      people.push({
        key: `result:${r.id}`,
        name: r.student_name,
        source: 'result',
        userId: r.user_id ?? null,
        studentResultId: r.id,
        photoUrl: r.photo_url || null,
        phone: null,
        examType: examFrom(r.exam_type),
        examYear: r.exam_year ?? null,
        airRank: r.rank ?? null,
        percentile: r.percentile ?? null,
        score: r.score ?? null,
        collegeAdmitted: r.college_name || null,
        // college_city is where they study now, not where they studied with us.
        city: null,
        label: ['Student result', r.exam_year].filter(Boolean).join(' · '),
      });
    }

    return NextResponse.json({ people: rankByName(people, q).slice(0, 20) }, { headers: NO_STORE });
  } catch (error: any) {
    console.error('[review-requests] people', error?.message || error);
    return NextResponse.json({ error: 'Search failed.' }, { status: 500, headers: NO_STORE });
  }
}

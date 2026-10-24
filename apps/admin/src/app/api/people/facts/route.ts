/**
 * POST /api/people/facts
 *
 * What PersonAvatar needs for a screenful of people, in one call: the ring
 * (student, paused, alumni, lead, staff, other), the language (recorded, or a
 * server-side guess from site language, state or city) and the glance details
 * its corners and hover card show (exam year, class, place, classroom,
 * activity, and the interest logged on an open follow-up).
 *
 * The class (Class 10, 11, 12 or a break year) is resolved here from four
 * places, first set wins: the Nexus enrolment, staff (users.study_stage), the
 * application form and the newest demo booking. See lib/person-study.ts.
 *
 * Body:
 *   ids     users.id values on screen (deduped, at most 500)
 *   places  people with no account yet (a staff-added demo request), keyed by
 *           the caller: { key, city?, state?, locale? }, answered with a guess only
 *
 * Returns { people: Record<id, PersonFacts>, places: Record<key, LanguageGuess | null> }.
 * An id that matches no user is simply absent.
 *
 * Staff only, through middleware.ts like every /api route here. POST because a
 * page of ids does not fit a URL, and it is per-screen data, so nothing to cache.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, mapClassToStandard } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import type { LanguageGuess, PersonFacts } from '@/lib/person-avatar';
import { guessLanguage } from '@/lib/person-language.server';
import { resolveStudyStage } from '@/lib/person-study';

const MAX_IDS = 500;
const MAX_PLACES = 200;
/** PostgREST puts .in() lists in the URL; long lists of UUIDs overflow it. */
const CHUNK = 200;
const OPEN_FOLLOW_UP = ['pending', 'scheduled', 'attempted'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PlaceInput {
  key: string;
  city?: string | null;
  state?: string | null;
  locale?: string | null;
}

function str(v: unknown, max = 120): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

const USER_COLUMNS = 'id, name, avatar_url, user_type, preferred_language, home_language, limited_english';
/** Added by 20261226100000_users_study_stage.sql. */
const STUDY_COLUMNS = 'study_stage, twelfth_passed_year';

/** Postgres "undefined column": the study columns are not on this database yet. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42703' || /does not exist/i.test(error.message ?? ''));
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  if (!getRequestAdminId(request)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  let body: { ids?: unknown; places?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = Array.from(
    new Set((Array.isArray(body.ids) ? body.ids : []).filter((id): id is string => typeof id === 'string' && UUID.test(id))),
  ).slice(0, MAX_IDS);

  const places: PlaceInput[] = (Array.isArray(body.places) ? body.places : [])
    .slice(0, MAX_PLACES)
    .map((p) => (p && typeof p === 'object' ? (p as Record<string, unknown>) : {}))
    .map((p) => ({ key: str(p.key, 200) ?? '', city: str(p.city), state: str(p.state), locale: str(p.locale, 10) }))
    .filter((p) => p.key);

  const supabase = getSupabaseAdminClient() as any;
  const people: Record<string, PersonFacts> = {};

  try {
    for (const part of chunks(ids, CHUNK)) {
      // users holds everyone (staff and parents too) plus the language columns;
      // the lifecycle view adds the funnel facts, but only for leads and students.
      const readUsers = (columns: string) => supabase.from('users').select(columns).in('id', part);
      const [firstUsersRes, lifecycleRes, followUpsRes, leadsRes, demosRes] = await Promise.all([
        readUsers(`${USER_COLUMNS}, ${STUDY_COLUMNS}`),
        supabase
          .from('user_lifecycle_view')
          .select(
            'id, lifecycle_stage, pipeline_stage, is_alumni, student_profile_id, linked_classroom_email, state, city, exam_year, current_standard, nexus_classroom_name, engagement, last_meaningful_activity_at',
          )
          .in('id', part),
        // Newest first, so the first interest seen per person is the latest one logged.
        supabase
          .from('crm_follow_ups')
          .select('user_id, interest_level, created_at')
          .in('user_id', part)
          .in('status', OPEN_FOLLOW_UP)
          .not('interest_level', 'is', null)
          .order('created_at', { ascending: false }),
        // A person can have more than one application; the newest one speaks for them.
        supabase
          .from('lead_profiles')
          .select('user_id, academic_data, applicant_category, updated_at')
          .in('user_id', part)
          .order('updated_at', { ascending: false }),
        supabase
          .from('demo_class_registrations')
          .select('user_id, current_class, created_at')
          .in('user_id', part)
          .not('current_class', 'is', null)
          .order('created_at', { ascending: false }),
      ]);
      // Before the migration lands, read users as before rather than fail every avatar.
      const usersRes = isMissingColumn(firstUsersRes.error) ? await readUsers(USER_COLUMNS) : firstUsersRes;
      if (usersRes.error) throw usersRes.error;
      if (lifecycleRes.error) throw lifecycleRes.error;
      // Heat is a nice-to-have: a failed read leaves it blank rather than failing the screen.
      const interest = new Map<string, string>();
      for (const f of followUpsRes.error ? [] : followUpsRes.data ?? []) {
        if (f.user_id && !interest.has(f.user_id)) interest.set(f.user_id, f.interest_level);
      }
      // The class is a nice-to-have too: a failed read only drops that source.
      const application = new Map<string, any>();
      for (const lp of leadsRes.error ? [] : leadsRes.data ?? []) {
        if (lp.user_id && !application.has(lp.user_id)) application.set(lp.user_id, lp);
      }
      const demoClass = new Map<string, string>();
      for (const d of demosRes.error ? [] : demosRes.data ?? []) {
        if (d.user_id && !demoClass.has(d.user_id)) demoClass.set(d.user_id, d.current_class);
      }

      const lifecycle = new Map<string, any>((lifecycleRes.data ?? []).map((r: any) => [r.id, r]));
      for (const u of usersRes.data ?? []) {
        const l = lifecycle.get(u.id) ?? {};
        const lp = application.get(u.id);
        const study = resolveStudyStage({
          enrolment: l.current_standard,
          staff: u.study_stage,
          application: lp ? mapClassToStandard(lp.academic_data ?? null, lp.applicant_category ?? null) : null,
          demo: demoClass.get(u.id),
          staffTwelfthYear: u.twelfth_passed_year,
          applicationTwelfthYear: lp?.academic_data?.twelfth_year,
        });
        people[u.id] = {
          name: u.name ?? null,
          avatarUrl: u.avatar_url ?? null,
          userType: u.user_type ?? null,
          lifecycleStage: l.lifecycle_stage ?? null,
          pipelineStage: l.pipeline_stage ?? null,
          isAlumni: l.is_alumni === true,
          studentProfileId: l.student_profile_id ?? null,
          linkedClassroomEmail: l.linked_classroom_email ?? null,
          homeLanguage: u.home_language ?? null,
          limitedEnglish: u.limited_english === true,
          guess: guessLanguage({
            homeLanguage: u.home_language,
            locale: u.preferred_language,
            state: l.state,
            city: l.city,
          }),
          examYear: l.exam_year ?? null,
          currentStandard: study.stage,
          studySource: study.source,
          twelfthPassedYear: study.twelfthPassedYear,
          city: l.city ?? null,
          state: l.state ?? null,
          classroomName: l.nexus_classroom_name ?? null,
          engagement: l.engagement ?? null,
          lastActiveAt: l.last_meaningful_activity_at ?? null,
          interest: interest.get(u.id) ?? null,
        };
      }
    }
  } catch (err) {
    console.error('[people/facts] lookup failed', err);
    return NextResponse.json({ error: 'Could not load people' }, { status: 500 });
  }

  const placeGuesses: Record<string, LanguageGuess | null> = {};
  for (const p of places) placeGuesses[p.key] = guessLanguage(p);

  return NextResponse.json({ people, places: placeGuesses });
}

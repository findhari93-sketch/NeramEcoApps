// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/course-plans/seed
 * One-time endpoint to seed the NATA 2026 Crash Course plan.
 * Body: { classroom_id }
 * Teacher-only.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id } = await request.json();

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Verify user exists
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify teacher enrollment
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can seed course plans' }, { status: 403 });
    }

    // Check if NATA 2026 plan already exists for this classroom
    const { data: existingPlan } = await supabase
      .from('nexus_course_plans')
      .select('id')
      .eq('classroom_id', classroom_id)
      .eq('name', 'NATA 2026 Crash Course')
      .single();

    if (existingPlan) {
      return NextResponse.json({ error: 'NATA 2026 plan already exists for this classroom', plan_id: existingPlan.id }, { status: 409 });
    }

    // ---- 1. Create Plan ----
    const { data: plan, error: planError } = await supabase
      .from('nexus_course_plans')
      .insert({
        classroom_id,
        name: 'NATA 2026 Crash Course',
        description: '5-week intensive crash course for NATA 2026. Covers all Part A drawing and Part B aptitude topics with daily AM/PM sessions, weekly tests, and spaced-repetition drill practice.',
        duration_weeks: 5,
        days_per_week: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        sessions_per_day: [
          { slot: 'am', start: '11:00', end: '12:00' },
          { slot: 'pm', start: '19:00', end: '20:00' },
        ],
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();

    if (planError) throw planError;

    // ---- 2. Create 5 Weeks ----
    const weekData = [
      { week_number: 1, title: 'Foundations', goal: 'Build base knowledge in all areas' },
      { week_number: 2, title: 'Core Exam Topics', goal: 'Cover all HIGH frequency topics' },
      { week_number: 3, title: 'Advanced & Emerging Topics', goal: 'Cover MEDIUM frequency topics + new 2026 predictions' },
      { week_number: 4, title: 'Mastery & Speed', goal: 'Build speed (43 sec/question target). Polish drawing skills.' },
      { week_number: 5, title: 'Final Polish & Exam Readiness', goal: 'Confidence building, weak area targeting, exam simulation.' },
    ];

    const { data: weeks, error: weeksError } = await supabase
      .from('nexus_course_plan_weeks')
      .insert(
        weekData.map((w, i) => ({
          plan_id: plan.id,
          week_number: w.week_number,
          title: w.title,
          goal: w.goal,
          sort_order: i,
        }))
      )
      .select()
      .order('week_number', { ascending: true });

    if (weeksError) throw weeksError;

    // ---- 3. Create 60 Session Shells (30 days x 2 slots) ----
    const daysPerWeek = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const slots = [
      { slot: 'am', start: '11:00', end: '12:00' },
      { slot: 'pm', start: '19:00', end: '20:00' },
    ];

    const sessionInserts: any[] = [];
    let globalDayNumber = 0;

    for (const week of (weeks || [])) {
      for (let dayIdx = 0; dayIdx < daysPerWeek.length; dayIdx++) {
        globalDayNumber++;
        const dayOfWeek = daysPerWeek[dayIdx];
        for (const slotDef of slots) {
          sessionInserts.push({
            week_id: week.id,
            plan_id: plan.id,
            day_number: globalDayNumber,
            day_of_week: dayOfWeek,
            slot: slotDef.slot,
            title: `Day ${globalDayNumber} - ${slotDef.slot.toUpperCase()}`,
            status: 'planned',
          });
        }
      }
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('nexus_course_plan_sessions')
      .insert(sessionInserts)
      .select('id, day_number, slot')
      .order('day_number', { ascending: true });

    if (sessionsError) throw sessionsError;

    // Get the first session ID for resource attachment
    const firstSessionId = sessions?.[0]?.id;

    // ---- 4. Create 20 Drill Questions ----
    const drillQuestions = [
      { q: 'Two equilateral triangles (side 20cm) placed adjacent — count right-angled/total triangles', a: 'Count systematically using the combined figure', f: '4+ sessions' },
      { q: 'Price increase 20% then 10% discount — net profit?', a: '8% net profit', f: '5+ sessions' },
      { q: 'Nobel Peace Prize 2024?', a: 'Nihon Hidankyo', f: '6+ sessions' },
      { q: 'Lok Sabha seats (old / new parliament)?', a: '543 old / 888 new', f: '5+ sessions' },
      { q: 'Clock angle at 4:30?', a: '45°', f: '4+ sessions' },
      { q: 'Scalene triangle axes of symmetry?', a: '0', f: '4+ sessions' },
      { q: 'Words from R, T, A?', a: 'RAT, TAR, ART (3 words)', f: '4+ sessions' },
      { q: 'Series: 1, 3, 9, ?, 81', a: '27', f: '3+ sessions' },
      { q: 'Matri Mandir shape?', a: 'Spherical', f: '3+ sessions' },
      { q: 'Kala Pani / Cellular Jail location?', a: 'Andaman & Nicobar', f: '3+ sessions' },
      { q: 'If P is 40% of Q, what is 15% of P?', a: '0.06Q', f: '3+ sessions' },
      { q: 'Sum of factors of 20?', a: '42', f: '3+ sessions' },
      { q: "'Architecture is frozen music' — who said it?", a: 'Goethe', f: '3+ sessions' },
      { q: 'Shirdi location?', a: 'Maharashtra', f: '3+ sessions' },
      { q: 'Olympic logo — correct colour sequence?', a: 'Blue, Yellow, Black, Green, Red (left to right)', f: '4+ sessions' },
      { q: 'Draupadi Murmu — odd one out by position?', a: 'President (others are not)', f: '3+ sessions' },
      { q: 'Sanchi Stupa dome (Anda) represents?', a: 'Cycle of life and death', f: '3+ sessions' },
      { q: 'Wooden stilt houses found in?', a: 'Assam', f: '3+ sessions' },
      { q: 'Houses with sloped roofs indicate?', a: 'Heavy rainfall areas', f: '3+ sessions' },
      { q: 'WC stands for?', a: 'Water Closet', f: '4+ sessions' },
    ];

    const { error: drillError } = await supabase
      .from('nexus_course_plan_drills')
      .insert(
        drillQuestions.map((d, i) => ({
          plan_id: plan.id,
          question_text: d.q,
          answer_text: d.a,
          frequency_note: d.f,
          sort_order: i + 1,
          is_active: true,
        }))
      );

    if (drillError) throw drillError;

    // ---- 5. Create 5 Weekly Tests ----
    const testData = [
      { title: 'Week 1 Mini Test', question_count: 30, duration_minutes: 40, scope: 'Week 1 topics only', week_idx: 0 },
      { title: 'Week 2 Progress Test', question_count: 40, duration_minutes: 45, scope: 'Weeks 1-2', week_idx: 1 },
      { title: 'Week 3 Half Mock', question_count: 50, duration_minutes: 50, scope: 'Weeks 1-3, exam-style', week_idx: 2 },
      { title: 'Week 4 Full Mock', question_count: 75, duration_minutes: 60, scope: 'All topics', week_idx: 3 },
      { title: 'Final Mock', question_count: 100, duration_minutes: 70, scope: 'Full exam simulation', week_idx: 4 },
    ];

    const { error: testError } = await supabase
      .from('nexus_course_plan_tests')
      .insert(
        testData.map((t, i) => ({
          plan_id: plan.id,
          week_id: weeks![t.week_idx].id,
          title: t.title,
          question_count: t.question_count,
          duration_minutes: t.duration_minutes,
          scope: t.scope,
          sort_order: i,
        }))
      );

    if (testError) throw testError;

    // ---- 6. Create Study Resources ----
    const resourceData = [
      { title: 'Khan Academy — Geometry', url: 'https://www.khanacademy.org/math/geometry', type: 'practice' },
      { title: 'IndiaBIX — Reasoning & Aptitude', url: 'https://www.indiabix.com/', type: 'practice' },
      { title: 'Drawabox — Drawing Fundamentals', url: 'https://drawabox.com/', type: 'practice' },
      { title: 'Proko — Figure Drawing & Shading', url: 'https://www.proko.com/', type: 'video' },
      { title: 'Inshorts — Daily Current Affairs', url: 'https://www.inshorts.com/', type: 'reference' },
      { title: 'Leonardo da Vinci — 10 Famous Artworks', url: 'https://en.wikipedia.org/wiki/List_of_works_by_Leonardo_da_Vinci', type: 'reference' },
    ];

    const { error: resourceError } = await supabase
      .from('nexus_course_plan_resources')
      .insert(
        resourceData.map((r, i) => ({
          plan_id: plan.id,
          title: r.title,
          url: r.url,
          type: r.type,
          session_id: firstSessionId, // Attach to first session to satisfy CHECK constraint
          sort_order: i,
        }))
      );

    if (resourceError) throw resourceError;

    return NextResponse.json({
      success: true,
      plan_id: plan.id,
      summary: {
        weeks: weeks?.length || 0,
        sessions: sessions?.length || 0,
        drills: drillQuestions.length,
        tests: testData.length,
        resources: resourceData.length,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to seed course plan';
    console.error('Seed error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

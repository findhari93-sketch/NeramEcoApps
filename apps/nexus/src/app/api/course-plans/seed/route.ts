// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/* ------------------------------------------------------------------ */
/*  NATA 2026 Crash Course — Full session data from PDF               */
/* ------------------------------------------------------------------ */

/** Teacher shorthand → display name (no user_ids in seed) */
const TEACHERS = { S: 'Sudarshini', Si: 'Sivaram', H: 'Hari', All: 'All' } as const;

type TeacherKey = keyof typeof TEACHERS;

/** Homework type classifier based on content keywords */
function classifyHomework(text: string): 'drawing' | 'mcq' | 'study' | 'review' | 'mixed' {
  const lower = text.toLowerCase();
  if (/error\s*log|review|formula\s*sheet|rest|ready|sleep|kit/i.test(lower)) return 'review';

  const hasDrawing = /colour\s*wheel|poster|sketch|still\s*life|composition|sculpture|logo|b\s*&\s*w|part\s*a\s*set|timed|drawing/i.test(lower);
  const hasMcq = /mcq|problem|quiz|drill|qs\b|question/i.test(lower);
  const hasStudy = /fact|vocab|word|term|concept|material|monument|artwork|memorize/i.test(lower);

  const flags = [hasDrawing, hasMcq, hasStudy].filter(Boolean).length;
  if (flags >= 2) return 'mixed';
  if (hasDrawing) return 'drawing';
  if (hasMcq) return 'mcq';
  if (hasStudy) return 'study';
  return 'mixed';
}

interface SessionDef {
  title: string;
  teacher: TeacherKey;
}

interface DayDef {
  am: SessionDef;
  pm: SessionDef;
  homework: string;
}

interface WeekDef {
  title: string;
  goal: string;
  days: DayDef[];
}

/** Complete NATA 2026 course data — 5 weeks, 6 days each, AM + PM sessions */
const NATA_2026_WEEKS: WeekDef[] = [
  // -------- WEEK 1: Foundations --------
  {
    title: 'Foundations',
    goal: 'Build base knowledge in all areas',
    days: [
      {
        am: { title: 'Colour Theory basics', teacher: 'S' },
        pm: { title: 'Triangle counting basics', teacher: 'Si' },
        homework: '2 colour wheels + 5 triangle figures',
      },
      {
        am: { title: 'Monuments India - Set 1', teacher: 'S' },
        pm: { title: 'Percentages & Profit/Loss', teacher: 'Si' },
        homework: '10 monuments + 10 % problems',
      },
      {
        am: { title: 'English Grammar', teacher: 'S' },
        pm: { title: 'Inscribed shapes & Area', teacher: 'Si' },
        homework: '15 grammar MCQs + 10 area problems',
      },
      {
        am: { title: 'DRAWING: Pencil + 2D Comp', teacher: 'H' },
        pm: { title: 'Blood relations & Family', teacher: 'Si' },
        homework: '1 poster + 8 blood relation problems',
      },
      {
        am: { title: 'Current Affairs Batch 1', teacher: 'S' },
        pm: { title: 'Ratios & Age problems', teacher: 'Si' },
        homework: '20 CA facts + 10 ratio problems',
      },
      {
        am: { title: 'Logo & Symbol ID', teacher: 'S' },
        pm: { title: 'WEEK 1 TEST (30 Qs)', teacher: 'Si' },
        homework: 'Complete Error Log',
      },
    ],
  },

  // -------- WEEK 2: Core Exam Topics --------
  {
    title: 'Core Exam Topics',
    goal: 'Cover all HIGH frequency topics',
    days: [
      {
        am: { title: 'Monuments - Set 2 (World)', teacher: 'S' },
        pm: { title: 'Clock angle & Mirror', teacher: 'Si' },
        homework: '15 monuments + 10 clock problems',
      },
      {
        am: { title: 'English Vocab & Idioms', teacher: 'S' },
        pm: { title: 'Direction sense', teacher: 'Si' },
        homework: '25 vocab words + 10 direction problems',
      },
      {
        am: { title: 'DRAWING: 3D Still Life', teacher: 'H' },
        pm: { title: 'Geometry Area & Volume', teacher: 'Si' },
        homework: '2 still life + 10 geometry problems',
      },
      {
        am: { title: 'Architecture terminology', teacher: 'S' },
        pm: { title: 'Analogies & Odd one out', teacher: 'Si' },
        homework: '20 terms + 15 analogy problems',
      },
      {
        am: { title: 'Colour theory Advanced', teacher: 'S' },
        pm: { title: 'Number theory + Series', teacher: 'Si' },
        homework: '5 colour schemes + 12 number problems',
      },
      {
        am: { title: 'DRAWING: Design Principles', teacher: 'H' },
        pm: { title: 'WEEK 2 TEST (40 Qs)', teacher: 'Si' },
        homework: '2 compositions + Error Log',
      },
    ],
  },

  // -------- WEEK 3: Advanced & Emerging Topics --------
  {
    title: 'Advanced & Emerging Topics',
    goal: 'Cover MEDIUM frequency topics + new 2026 predictions',
    days: [
      {
        am: { title: 'Art History & Paintings', teacher: 'S' },
        pm: { title: 'Gear rotation & Wheels', teacher: 'Si' },
        homework: '10 artworks + 8 gear problems',
      },
      {
        am: { title: 'Building materials', teacher: 'S' },
        pm: { title: 'Coding/Decoding + Seating', teacher: 'Si' },
        homework: '15 materials + 10 coding problems',
      },
      {
        am: { title: 'DRAWING: Sculptural Forms', teacher: 'H' },
        pm: { title: 'Spatial reasoning & Views', teacher: 'Si' },
        homework: '3 sculptures + 10 spatial problems',
      },
      {
        am: { title: 'Environment & Sustainability', teacher: 'S' },
        pm: { title: 'Probability + Advanced geo', teacher: 'Si' },
        homework: '10 concepts + 10 math problems',
      },
      {
        am: { title: 'GK Rapid Fire - Mixed', teacher: 'S' },
        pm: { title: 'Advanced shape counting', teacher: 'Si' },
        homework: '20 GK facts + 8 counting problems',
      },
      {
        am: { title: 'English: Comprehension', teacher: 'S' },
        pm: { title: 'WEEK 3 TEST (50 Qs)', teacher: 'Si' },
        homework: '3 paragraphs + Error Log',
      },
    ],
  },

  // -------- WEEK 4: Mastery & Speed --------
  {
    title: 'Mastery & Speed',
    goal: 'Build speed (43 sec/question target). Polish drawing skills.',
    days: [
      {
        am: { title: 'DRAWING: Logo & Emblem', teacher: 'H' },
        pm: { title: 'Speed drill 25 Qs/20 min', teacher: 'Si' },
        homework: '2 logos + drill review',
      },
      {
        am: { title: 'Monuments & GK Revision', teacher: 'S' },
        pm: { title: 'Advanced blood/ratio/age', teacher: 'Si' },
        homework: '20 monument quiz + 10 advanced',
      },
      {
        am: { title: 'English Complete Revision', teacher: 'S' },
        pm: { title: 'Remaining math topics', teacher: 'Si' },
        homework: '20 English + 12 misc math',
      },
      {
        am: { title: 'DRAWING: Speed + B&W', teacher: 'H' },
        pm: { title: 'Exam-style problems', teacher: 'Si' },
        homework: '1 timed B&W + 15 problems',
      },
      {
        am: { title: 'All concepts rapid quiz', teacher: 'S' },
        pm: { title: 'Math complete revision', teacher: 'Si' },
        homework: 'Personal formula sheet',
      },
      {
        am: { title: 'FULL MOCK Part B (75 Qs)', teacher: 'S' },
        pm: { title: 'FULL MOCK Part A (3 dwg)', teacher: 'H' },
        homework: 'Review mock + Error Log',
      },
    ],
  },

  // -------- WEEK 5: Final Polish & Exam Readiness --------
  {
    title: 'Final Polish & Exam Readiness',
    goal: 'Confidence building, weak area targeting, exam simulation.',
    days: [
      {
        am: { title: 'Weak area workshop B', teacher: 'S' },
        pm: { title: 'Weak area workshop Math', teacher: 'Si' },
        homework: 'Redo all Error Log mistakes',
      },
      {
        am: { title: 'DRAWING: All 3 types', teacher: 'H' },
        pm: { title: 'Repeat questions drill', teacher: 'Si' },
        homework: '1 Part A set + memorize repeats',
      },
      {
        am: { title: 'FINAL MOCK Part B (100Q)', teacher: 'S' },
        pm: { title: 'FINAL MOCK Part A', teacher: 'H' },
        homework: 'Review + light revision',
      },
      {
        am: { title: 'Current affairs 2026', teacher: 'S' },
        pm: { title: 'Speed drill 50 Qs/35 min', teacher: 'Si' },
        homework: 'Good sleep. Kit ready.',
      },
      {
        am: { title: 'Exam strategy & tips', teacher: 'All' },
        pm: { title: 'Doubt clearing session', teacher: 'All' },
        homework: 'REST',
      },
      {
        am: { title: 'DRAWING: Confidence', teacher: 'H' },
        pm: { title: 'Motivation + Logistics', teacher: 'All' },
        homework: "You're ready!",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */

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
        teaching_team: [
          { key: 'S', name: 'Sudarshini', role: 'GK / English / Art History' },
          { key: 'Si', name: 'Sivaram', role: 'Math / Logical Reasoning' },
          { key: 'H', name: 'Hari', role: 'Drawing / Design' },
        ],
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();

    if (planError) throw planError;

    // ---- 2. Create 5 Weeks ----
    const weekInserts = NATA_2026_WEEKS.map((w, i) => ({
      plan_id: plan.id,
      week_number: i + 1,
      title: w.title,
      goal: w.goal,
      sort_order: i,
    }));

    const { data: weeks, error: weeksError } = await supabase
      .from('nexus_course_plan_weeks')
      .insert(weekInserts)
      .select()
      .order('week_number', { ascending: true });

    if (weeksError) throw weeksError;

    // ---- 3. Create 60 Sessions with exact titles & teachers ----
    const daysOfWeek = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const sessionInserts: any[] = [];
    let globalDayNumber = 0;

    for (let wIdx = 0; wIdx < NATA_2026_WEEKS.length; wIdx++) {
      const weekDef = NATA_2026_WEEKS[wIdx];
      const weekRow = weeks![wIdx];

      for (let dIdx = 0; dIdx < weekDef.days.length; dIdx++) {
        globalDayNumber++;
        const day = weekDef.days[dIdx];
        const dayOfWeek = daysOfWeek[dIdx];

        // AM session
        sessionInserts.push({
          week_id: weekRow.id,
          plan_id: plan.id,
          day_number: globalDayNumber,
          day_of_week: dayOfWeek,
          slot: 'am',
          title: day.am.title,
          notes: `Teacher: ${TEACHERS[day.am.teacher]}`,
          status: 'planned',
        });

        // PM session
        sessionInserts.push({
          week_id: weekRow.id,
          plan_id: plan.id,
          day_number: globalDayNumber,
          day_of_week: dayOfWeek,
          slot: 'pm',
          title: day.pm.title,
          notes: `Teacher: ${TEACHERS[day.pm.teacher]}`,
          status: 'planned',
        });
      }
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('nexus_course_plan_sessions')
      .insert(sessionInserts)
      .select('id, day_number, slot')
      .order('day_number', { ascending: true });

    if (sessionsError) throw sessionsError;

    // Build a lookup: day_number → { am: sessionId, pm: sessionId }
    const sessionMap: Record<number, { am?: string; pm?: string }> = {};
    for (const s of sessions || []) {
      if (!sessionMap[s.day_number]) sessionMap[s.day_number] = {};
      sessionMap[s.day_number][s.slot as 'am' | 'pm'] = s.id;
    }

    // ---- 4. Create Homework entries (one per day, linked to AM session) ----
    const homeworkInserts: any[] = [];
    globalDayNumber = 0;

    for (const weekDef of NATA_2026_WEEKS) {
      for (const day of weekDef.days) {
        globalDayNumber++;
        const amSessionId = sessionMap[globalDayNumber]?.am;
        if (!amSessionId) continue;

        homeworkInserts.push({
          session_id: amSessionId,
          plan_id: plan.id,
          title: day.homework,
          type: classifyHomework(day.homework),
          estimated_minutes: 45,
          sort_order: globalDayNumber,
        });
      }
    }

    const { data: homework, error: homeworkError } = await supabase
      .from('nexus_course_plan_homework')
      .insert(homeworkInserts)
      .select('id');

    if (homeworkError) throw homeworkError;

    // ---- 5. Create 20 Drill Questions ----
    const drillQuestions = [
      { q: 'Two equilateral triangles (side 20cm) placed adjacent — count right-angled/total triangles', a: 'Count systematically using the combined figure', f: '4+ sessions' },
      { q: 'Price increase 20% then 10% discount — net profit?', a: '8% net profit', f: '5+ sessions' },
      { q: 'Nobel Peace Prize 2024?', a: 'Nihon Hidankyo', f: '6+ sessions' },
      { q: 'Lok Sabha seats (old / new parliament)?', a: '543 old / 888 new', f: '5+ sessions' },
      { q: 'Clock angle at 4:30?', a: '45\u00B0', f: '4+ sessions' },
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
      .from('nexus_course_plan_drill')
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

    // ---- 6. Create 5 Weekly Tests ----
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

    // ---- 7. Create Study Resources ----
    const firstSessionId = sessions?.[0]?.id;

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
        homework: homework?.length || 0,
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

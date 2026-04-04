// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getCoursePlanById,
  bulkPopulatePlan,
} from '@neram/database';
import type { CoursePlanCSVData } from '@/lib/course-plan-csv-schema';

/**
 * POST /api/course-plans/[id]/csv-upload
 *
 * Import parsed CSV data into the course plan.
 * Expects a CoursePlanCSVData shape in the request body along with
 * teacher abbreviation-to-userId mappings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: planId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Resolve DB user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch the plan to get structure (days_per_week, classroom_id)
    const plan = await getCoursePlanById(planId, supabase);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Verify teacher role in plan's classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Only teachers can import course plan data' },
        { status: 403 }
      );
    }

    // Parse body: expects { data: CoursePlanCSVData, teacherMap: Record<abbreviation, userId> }
    const body = await request.json();
    const csvData: CoursePlanCSVData = body.data;
    const teacherMap: Record<string, string> = body.teacherMap || {};

    if (!csvData) {
      return NextResponse.json(
        { error: 'Missing "data" in request body' },
        { status: 400 }
      );
    }

    const daysPerWeek = plan.days_per_week || [];

    // Transform sessions: calculate day_number from week + day index
    const transformedSessions = (csvData.sessions || []).map((session) => {
      const dayNumber =
        (session.week - 1) * daysPerWeek.length + session.day;

      // Resolve teacher abbreviation to user_id
      const teacherId = session.teacher
        ? teacherMap[session.teacher.toLowerCase()] ||
          teacherMap[session.teacher] ||
          undefined
        : undefined;

      return {
        day_number: dayNumber,
        slot: session.slot,
        title: session.title,
        teacher_id: teacherId,
        description: undefined,
      };
    });

    // Transform homework: attach to session by day_number and slot
    const transformedHomework = (csvData.sessions || [])
      .filter((session) => session.homework)
      .map((session) => {
        const dayNumber =
          (session.week - 1) * daysPerWeek.length + session.day;
        return {
          session_day_number: dayNumber,
          session_slot: session.slot,
          title: session.homework,
          type: session.homework_type || 'mixed',
          max_points: session.homework_points || undefined,
          estimated_minutes: session.homework_minutes || undefined,
        };
      });

    // Transform weeks
    const transformedWeeks = (csvData.weeks || []).map((week) => ({
      week_number: week.week,
      title: week.title,
      goal: week.goal,
    }));

    // Transform tests
    const transformedTests = (csvData.tests || []).map((test) => ({
      week_number: test.week,
      title: test.title,
      question_count: test.questions || undefined,
      duration_minutes: test.duration || undefined,
      scope: test.scope || undefined,
    }));

    // Transform drills
    const transformedDrills = (csvData.drills || []).map((drill) => ({
      question_text: drill.question,
      answer_text: drill.answer,
      explanation: drill.explanation || undefined,
      frequency_note: drill.frequency || undefined,
    }));

    // Transform resources
    const transformedResources = (csvData.resources || []).map((res) => ({
      title: res.title,
      url: res.url,
      type: res.type || 'reference',
    }));

    // Call bulkPopulatePlan
    const summary = await bulkPopulatePlan(
      planId,
      {
        weeks: transformedWeeks,
        sessions: transformedSessions,
        homework: transformedHomework,
        tests: transformedTests,
        drills: transformedDrills,
        resources: transformedResources,
      },
      supabase
    );

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to import CSV data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

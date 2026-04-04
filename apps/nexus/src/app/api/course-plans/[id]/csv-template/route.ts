// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getCoursePlanById } from '@neram/database';
import { generateCSVTemplate } from '@/lib/course-plan-csv-parser';
import type { TeacherMapping } from '@/lib/course-plan-csv-schema';

/**
 * GET /api/course-plans/[id]/csv-template
 *
 * Download a pre-filled CSV template for the given course plan.
 * The template includes all session slots, week shells, and teacher abbreviations.
 */
export async function GET(
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

    // Fetch the plan with structure
    const plan = await getCoursePlanById(planId, supabase);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Verify enrollment in plan's classroom
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json(
        { error: 'Not enrolled in this classroom' },
        { status: 403 }
      );
    }

    // Fetch enrolled teachers for the classroom
    const { data: teachers } = await supabase
      .from('nexus_enrollments')
      .select(
        'user_id, users:users!nexus_enrollments_user_id_fkey(id, name)'
      )
      .eq('classroom_id', plan.classroom_id)
      .eq('role', 'teacher')
      .eq('is_active', true);

    // Generate teacher abbreviation mappings (disambiguate if needed)
    const teacherMappings = buildTeacherMappings(teachers || []);

    // Build plan info for the template generator
    const planInfo = {
      name: plan.name,
      duration_weeks: plan.duration_weeks,
      days_per_week: plan.days_per_week || [],
      sessions_per_day: plan.sessions_per_day || [],
    };

    const csv = generateCSVTemplate(planInfo, teacherMappings);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="course-plan-template-${planId}.csv"`,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate CSV template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Build teacher abbreviation mappings from enrollment data.
 * Uses first letter of name, disambiguating with additional letters if needed.
 */
function buildTeacherMappings(
  enrollments: Array<{
    user_id: string;
    users: { id: string; name: string } | null;
  }>
): TeacherMapping[] {
  const mappings: TeacherMapping[] = [];
  const usedAbbreviations = new Set<string>();

  for (const enrollment of enrollments) {
    const name = enrollment.users?.name || 'Unknown';
    const userId = enrollment.users?.id || enrollment.user_id;

    // Try single first letter, then first 2 letters, etc.
    let abbreviation = '';
    const cleanName = name.replace(/\s+/g, '');
    for (let len = 1; len <= cleanName.length; len++) {
      const candidate = cleanName.substring(0, len).toUpperCase();
      if (!usedAbbreviations.has(candidate)) {
        abbreviation = candidate;
        break;
      }
    }

    // Fallback: append a number
    if (!abbreviation) {
      let counter = 1;
      const base = cleanName.charAt(0).toUpperCase();
      while (usedAbbreviations.has(`${base}${counter}`)) {
        counter++;
      }
      abbreviation = `${base}${counter}`;
    }

    usedAbbreviations.add(abbreviation);
    mappings.push({ abbreviation, name, user_id: userId });
  }

  return mappings;
}

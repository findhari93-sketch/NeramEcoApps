import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getOnboardingStatus,
  createOrGetOnboarding,
  updateOnboardingStep,
  submitOnboarding,
  getOnboardingRequiredTemplates,
} from '@neram/database/queries/nexus';

/**
 * GET /api/onboarding?classroom=<id>
 * Get student's onboarding status + required templates
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom param required' }, { status: 400 });
    }

    const onboarding = await getOnboardingStatus(user.id, classroomId);
    const requiredTemplates = await getOnboardingRequiredTemplates();

    // Get student's uploaded docs for these templates
    const db = supabase as any;
    const templateIds = requiredTemplates.map((t: any) => t.id);
    const { data: uploadedDocs } = await db
      .from('nexus_student_documents')
      .select('id, template_id, status, file_url, title')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_current', true)
      .eq('is_deleted', false)
      .in('template_id', templateIds);

    return NextResponse.json({
      onboarding,
      requiredTemplates,
      uploadedDocs: uploadedDocs || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get onboarding status';
    console.error('Onboarding GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/onboarding
 * Create or update onboarding progress
 * Body: { classroom_id, action: 'start' | 'update_step' | 'submit', step?, current_standard?, academic_year? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { classroom_id, action } = body;

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id required' }, { status: 400 });
    }

    let result;

    switch (action) {
      case 'start':
        result = await createOrGetOnboarding(user.id, classroom_id);
        break;

      case 'update_step':
        result = await updateOnboardingStep(user.id, classroom_id, body.step, {
          current_standard: body.current_standard,
          academic_year: body.academic_year,
        });

        // Also update nexus_enrollments.current_standard if provided
        if (body.current_standard) {
          const db = supabase as any;
          await db
            .from('nexus_enrollments')
            .update({ current_standard: body.current_standard })
            .eq('user_id', user.id)
            .eq('classroom_id', classroom_id);
        }
        break;

      case 'submit': {
        // Server-side validation: ensure all onboarding-required docs are uploaded
        const db2 = supabase as any;
        const { data: reqTemplates } = await db2
          .from('nexus_document_templates')
          .select('id, name')
          .eq('is_onboarding_required', true)
          .eq('is_active', true);

        const requiredIds = (reqTemplates || []).map((t: any) => t.id);

        const { data: uploadedDocs } = await db2
          .from('nexus_student_documents')
          .select('template_id')
          .eq('student_id', user.id)
          .eq('classroom_id', classroom_id)
          .eq('is_current', true)
          .eq('is_deleted', false)
          .in('template_id', requiredIds);

        const uploadedTemplateIds = new Set((uploadedDocs || []).map((d: any) => d.template_id));
        const missing = (reqTemplates || []).filter((t: any) => !uploadedTemplateIds.has(t.id));

        if (missing.length > 0) {
          const missingNames = missing.map((t: any) => t.name).join(', ');
          return NextResponse.json(
            { error: `Missing required documents: ${missingNames}` },
            { status: 400 }
          );
        }

        result = await submitOnboarding(user.id, classroom_id);
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ onboarding: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update onboarding';
    console.error('Onboarding POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

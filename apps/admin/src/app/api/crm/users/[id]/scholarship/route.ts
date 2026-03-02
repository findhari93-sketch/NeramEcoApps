// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  openScholarshipForUser,
  adminReviewScholarship,
  getScholarshipByLeadProfile,
  notifyScholarshipOpened,
  notifyScholarshipApproved,
  notifyScholarshipRejected,
  notifyScholarshipRevisionRequested,
} from '@neram/database';

/**
 * POST /api/crm/users/[id]/scholarship
 * Open scholarship for a user (admin action)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { adminId } = body;

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Find the user's most recent lead profile
    const { data: leadProfile, error: lpError } = await supabase
      .from('lead_profiles' as any)
      .select('id, user_id, school_type, scholarship_eligible, applicant_category')
      .eq('user_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lpError || !leadProfile) {
      return NextResponse.json(
        { error: 'No application found for this user' },
        { status: 404 }
      );
    }

    // Validate: must be government school
    if (leadProfile.school_type !== 'government_school') {
      return NextResponse.json(
        { error: 'User is not from a government school' },
        { status: 400 }
      );
    }

    // Check if already eligible
    if (leadProfile.scholarship_eligible) {
      return NextResponse.json(
        { error: 'Scholarship already opened for this user' },
        { status: 400 }
      );
    }

    // Open scholarship
    const result = await openScholarshipForUser(leadProfile.id, adminId);

    // Get user details for notification
    const { data: user } = await supabase
      .from('users' as any)
      .select('id, name, phone, email')
      .eq('id', params.id)
      .single();

    // Send notification
    if (user) {
      try {
        await notifyScholarshipOpened({
          userId: user.id,
          userName: user.name || 'Student',
          phone: user.phone || '',
          applicationNumber: result.leadProfile?.application_number,
        });
      } catch (err) {
        console.error('Scholarship opened notification error:', err);
      }
    }

    // Record in profile history
    await supabase.from('user_profile_history' as any).insert({
      user_id: params.id,
      field_name: 'scholarship.status',
      old_value: JSON.stringify('not_eligible'),
      new_value: JSON.stringify('eligible_pending'),
      changed_by: adminId,
      change_source: 'admin',
    });

    return NextResponse.json({
      success: true,
      scholarship: result.scholarship,
    });
  } catch (error: any) {
    console.error('CRM scholarship open error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to open scholarship' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/crm/users/[id]/scholarship
 * Review scholarship application (approve/reject/request_revision)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, adminId, scholarshipId, approved_fee, admin_notes, rejection_reason, revision_notes } = body;

    if (!action || !adminId || !scholarshipId) {
      return NextResponse.json(
        { error: 'action, adminId, and scholarshipId are required' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject', 'request_revision'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve", "reject", or "request_revision"' },
        { status: 400 }
      );
    }

    // Perform the review
    const result = await adminReviewScholarship(scholarshipId, action, {
      adminId,
      approved_fee: approved_fee !== undefined ? Number(approved_fee) : undefined,
      admin_notes: admin_notes || undefined,
      rejection_reason: rejection_reason || undefined,
      revision_notes: revision_notes || undefined,
    });

    // Get user details for notification
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id, name, phone, email')
      .eq('id', params.id)
      .single();

    // Get lead profile for application number
    const { data: leadProfile } = await supabase
      .from('lead_profiles' as any)
      .select('application_number')
      .eq('user_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Send appropriate notification
    if (user) {
      const notificationData = {
        userId: user.id,
        userName: user.name || 'Student',
        phone: user.phone || '',
        applicationNumber: leadProfile?.application_number || undefined,
      };

      try {
        switch (action) {
          case 'approve':
            await notifyScholarshipApproved({
              ...notificationData,
              approvedFee: result.approved_fee || approved_fee || 5000,
            });
            break;
          case 'reject':
            await notifyScholarshipRejected({
              ...notificationData,
              rejectionReason: rejection_reason || undefined,
            });
            break;
          case 'request_revision':
            await notifyScholarshipRevisionRequested({
              ...notificationData,
              revisionNotes: revision_notes || undefined,
            });
            break;
        }
      } catch (err) {
        console.error('Scholarship notification error:', err);
      }
    }

    // Record in profile history
    const oldStatus = action === 'approve' ? 'documents_submitted' : action === 'reject' ? 'documents_submitted' : 'documents_submitted';
    await supabase.from('user_profile_history' as any).insert({
      user_id: params.id,
      field_name: 'scholarship.status',
      old_value: JSON.stringify(oldStatus),
      new_value: JSON.stringify(result.scholarship_status),
      changed_by: adminId,
      change_source: 'admin',
    });

    return NextResponse.json({
      success: true,
      scholarship: result,
    });
  } catch (error: any) {
    console.error('CRM scholarship review error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to review scholarship' },
      { status: 500 }
    );
  }
}

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getUserById, updateUser, getLeadProfileByUserId, updateLeadProfile } from '@neram/database';

// GET /api/leads/[id] - Get a single lead
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    const profile = await getLeadProfileByUserId(id, supabase);

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      userType: user.user_type,
      course: profile?.interest_course || null,
      city: profile?.city || null,
      state: profile?.state || null,
      source: profile?.source || null,
      qualification: profile?.qualification || null,
      schoolCollege: profile?.school_college || null,
      applicationData: profile?.application_data || null,
      assignedFee: profile?.assigned_fee || null,
      discountAmount: profile?.discount_amount || null,
      finalFee: profile?.final_fee || null,
      couponCode: profile?.coupon_code || null,
      adminNotes: profile?.admin_notes || null,
      rejectionReason: profile?.rejection_reason || null,
      reviewedAt: profile?.reviewed_at || null,
      reviewedBy: profile?.reviewed_by || null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lead' },
      { status: 500 }
    );
  }
}

// PATCH /api/leads/[id] - Update a lead
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Update user fields
    const userUpdates: Record<string, unknown> = {};
    if (body.name !== undefined) userUpdates.name = body.name;
    if (body.email !== undefined) userUpdates.email = body.email;
    if (body.phone !== undefined) userUpdates.phone = body.phone;

    if (Object.keys(userUpdates).length > 0) {
      await updateUser(id, userUpdates as any, supabase);
    }

    // Update lead profile fields
    const profile = await getLeadProfileByUserId(id, supabase);
    if (profile) {
      const profileUpdates: Record<string, unknown> = {};
      if (body.course !== undefined) profileUpdates.interest_course = body.course;
      if (body.city !== undefined) profileUpdates.city = body.city;
      if (body.state !== undefined) profileUpdates.state = body.state;
      if (body.qualification !== undefined) profileUpdates.qualification = body.qualification;
      if (body.schoolCollege !== undefined) profileUpdates.school_college = body.schoolCollege;
      if (body.assignedFee !== undefined) profileUpdates.assigned_fee = body.assignedFee;
      if (body.discountAmount !== undefined) profileUpdates.discount_amount = body.discountAmount;
      if (body.finalFee !== undefined) profileUpdates.final_fee = body.finalFee;
      if (body.couponCode !== undefined) profileUpdates.coupon_code = body.couponCode;
      if (body.adminNotes !== undefined) profileUpdates.admin_notes = body.adminNotes;

      if (Object.keys(profileUpdates).length > 0) {
        await updateLeadProfile(profile.id, profileUpdates as any, supabase);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json(
      { error: 'Failed to update lead' },
      { status: 500 }
    );
  }
}

// DELETE /api/leads/[id] - Delete a lead
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const user = await getUserById(id, supabase);
    if (!user) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Delete user (cascade will delete lead_profile)
    const { error } = await (supabase as any)
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json(
      { error: 'Failed to delete lead' },
      { status: 500 }
    );
  }
}

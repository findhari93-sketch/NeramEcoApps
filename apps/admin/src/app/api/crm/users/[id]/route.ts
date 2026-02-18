import { NextRequest, NextResponse } from 'next/server';
import {
  getUserJourneyDetail,
  adminUpdateUserProfile,
  adminUpdateLeadProfile,
} from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const detail = await getUserJourneyDetail(params.id);

    if (!detail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error: any) {
    console.error('CRM user detail error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user detail' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userUpdates, leadUpdates, adminId } = body;

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required' },
        { status: 400 }
      );
    }

    const results: any = {};

    // Update user fields if provided
    if (userUpdates && Object.keys(userUpdates).length > 0) {
      results.user = await adminUpdateUserProfile(
        params.id,
        userUpdates,
        adminId
      );
    }

    // Update lead profile fields if provided
    if (leadUpdates && leadUpdates.profileId) {
      const { profileId, ...updates } = leadUpdates;
      if (Object.keys(updates).length > 0) {
        results.leadProfile = await adminUpdateLeadProfile(
          profileId,
          updates,
          adminId
        );
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('CRM user update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}

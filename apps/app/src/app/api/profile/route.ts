export const dynamic = 'force-dynamic';

/**
 * Profile API
 *
 * GET - Get current user profile
 * PUT - Update profile fields with history tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  updateUserProfile,
  getProfileHistory,
  getSupabaseAdminClient,
} from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/profile
 * Get current user profile
 */
export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from database (use admin client to bypass RLS)
    const user = await getUserByFirebaseUid(decodedToken.uid, getSupabaseAdminClient());

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          nickname: user.nickname,
          description: user.description,
          area_of_interest: user.area_of_interest,
          date_of_birth: user.date_of_birth,
          gender: user.gender,
          avatar_url: user.avatar_url,
          phone_verified: user.phone_verified,
          email_verified: user.email_verified,
          has_password: user.has_password,
          user_type: user.user_type,
          status: user.status,
          preferred_language: user.preferred_language,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error getting profile:', error);
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * PUT /api/profile
 * Update profile fields with history tracking
 */
export async function PUT(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const authHeader = req.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyIdToken(idToken);

    // Get user from database (use admin client to bypass RLS)
    const user = await getUserByFirebaseUid(decodedToken.uid, getSupabaseAdminClient());

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const body = await req.json();

    // Extract allowed update fields
    const updates: Record<string, any> = {};
    const allowedFields = [
      'first_name',
      'last_name',
      'nickname',
      'description',
      'area_of_interest',
      'date_of_birth',
      'gender',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    // Also update 'name' if first_name or last_name changed
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const firstName = updates.first_name ?? user.first_name ?? '';
      const lastName = updates.last_name ?? user.last_name ?? '';
      updates.name = `${firstName} ${lastName}`.trim() || user.name;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get client info for history tracking
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Update profile with history tracking
    const updatedUser = await updateUserProfile(
      user.id,
      updates,
      {
        changeSource: 'user',
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      }
    );

    return NextResponse.json(
      {
        success: true,
        user: {
          id: updatedUser?.id,
          email: updatedUser?.email,
          phone: updatedUser?.phone,
          name: updatedUser?.name,
          first_name: updatedUser?.first_name,
          last_name: updatedUser?.last_name,
          username: updatedUser?.username,
          nickname: updatedUser?.nickname,
          description: updatedUser?.description,
          area_of_interest: updatedUser?.area_of_interest,
          date_of_birth: updatedUser?.date_of_birth,
          gender: updatedUser?.gender,
          avatar_url: updatedUser?.avatar_url,
          phone_verified: updatedUser?.phone_verified,
          email_verified: updatedUser?.email_verified,
          user_type: updatedUser?.user_type,
          status: updatedUser?.status,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500, headers: corsHeaders }
    );
  }
}
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// POST /api/students/[id]/credentials - Publish MS Teams credentials for a student
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { email, password, credentialType, adminId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'email and password are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Lookup student_profile_id from student_profiles where user_id = id
    const { data: profile, error: profileError } = await supabase
      .from('student_profiles')
      .select('id')
      .eq('user_id', id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    // Insert into student_credentials
    const autoDestroyAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: credential, error: insertError } = await supabase
      .from('student_credentials')
      .insert({
        user_id: id,
        student_profile_id: profile.id,
        credential_type: credentialType || 'ms_teams',
        email,
        password,
        published_by: adminId || null,
        auto_destroy_at: autoDestroyAt,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Mask password in response
    return NextResponse.json({
      success: true,
      data: {
        ...credential,
        password: '********',
      },
    });
  } catch (error) {
    console.error('Error publishing credentials:', error);
    return NextResponse.json(
      { error: 'Failed to publish credentials' },
      { status: 500 }
    );
  }
}

// GET /api/students/[id]/credentials - Get active credentials for a student
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('student_credentials')
      .select('*')
      .eq('user_id', id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Mask passwords in response
    const masked = (data || []).map((cred) => ({
      ...cred,
      password: '********',
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credentials' },
      { status: 500 }
    );
  }
}

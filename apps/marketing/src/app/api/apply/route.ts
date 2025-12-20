// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createUser,
  createLeadProfile,
  getCourseBySlug,
} from '@neram/database';

// POST /api/apply - Submit application form
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      email,
      phone,
      interestedCourse,
      preferredLanguage,
      source,
      sourceDetails,
      notes,
    } = body;

    // Validate required fields
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate phone format (Indian phone number)
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!phoneRegex.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},phone.eq.${cleanPhone}`)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email or phone already exists' },
        { status: 409 }
      );
    }

    // Get course ID if course slug provided
    let courseId: string | undefined;
    if (interestedCourse) {
      const course = await getCourseBySlug(interestedCourse, supabase);
      if (course) {
        courseId = course.id;
      }
    }

    // Create user as lead
    const user = await createUser(
      {
        name,
        email,
        phone: cleanPhone,
        user_type: 'lead',
        status: 'pending',
        preferred_language: preferredLanguage || 'en',
      },
      supabase
    );

    // Create lead profile
    const leadProfile = await createLeadProfile(
      user.id,
      {
        source: source || 'website',
        source_details: sourceDetails || { page: 'apply' },
        interested_course: courseId || null,
        notes: notes || null,
        status: 'new',
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully',
      leadId: leadProfile.id,
    });
  } catch (error) {
    console.error('Error processing application:', error);
    return NextResponse.json(
      { error: 'Failed to submit application. Please try again.' },
      { status: 500 }
    );
  }
}

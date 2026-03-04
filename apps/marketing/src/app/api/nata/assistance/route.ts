import { NextRequest, NextResponse } from 'next/server';
import { submitNataAssistanceRequest } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { student_name, phone, district, school_name, category } = body;

    // Validate required fields
    if (!student_name || typeof student_name !== 'string' || student_name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Student name is required (minimum 2 characters).' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || !/^[6-9]\d{9}$/.test(phone.trim())) {
      return NextResponse.json(
        { error: 'A valid 10-digit Indian mobile number is required.' },
        { status: 400 }
      );
    }

    const result = await submitNataAssistanceRequest({
      student_name: student_name.trim(),
      phone: phone.trim(),
      district: district?.trim() || undefined,
      school_name: school_name?.trim() || undefined,
      category: category || 'general',
    });

    return NextResponse.json({ success: true, id: result.id }, { status: 201 });
  } catch (error) {
    console.error('Error submitting NATA assistance request:', error);
    return NextResponse.json(
      { error: 'Failed to submit request. Please try again later.' },
      { status: 500 }
    );
  }
}

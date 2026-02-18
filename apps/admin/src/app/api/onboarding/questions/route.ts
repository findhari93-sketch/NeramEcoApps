// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { listOnboardingQuestions, createOnboardingQuestion } from '@neram/database';

// GET /api/onboarding/questions - List all questions (including inactive)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');

    const options: { isActive?: boolean } = {};
    if (isActive !== null) {
      options.isActive = isActive === 'true';
    }

    const data = await listOnboardingQuestions(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing onboarding questions:', error);
    return NextResponse.json(
      { error: 'Failed to list onboarding questions' },
      { status: 500 }
    );
  }
}

// POST /api/onboarding/questions - Create a new question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question_key,
      question_text,
      question_text_ta,
      question_type,
      options,
      display_order,
      is_active,
      is_required,
      maps_to_field,
    } = body;

    if (!question_key || !question_text || !question_type) {
      return NextResponse.json(
        { error: 'question_key, question_text, and question_type are required' },
        { status: 400 }
      );
    }

    const data = await createOnboardingQuestion({
      question_key,
      question_text,
      question_text_ta: question_text_ta || null,
      question_type,
      options: options || [],
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : true,
      is_required: is_required !== undefined ? is_required : true,
      maps_to_field: maps_to_field || null,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating onboarding question:', error);
    return NextResponse.json(
      { error: 'Failed to create onboarding question' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/onboarding/questions
 * Returns active onboarding questions ordered by display_order
 */

import { NextResponse } from 'next/server';
import { getActiveOnboardingQuestions } from '@neram/database';

export async function GET() {
  try {
    const questions = await getActiveOnboardingQuestions();
    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error fetching onboarding questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}

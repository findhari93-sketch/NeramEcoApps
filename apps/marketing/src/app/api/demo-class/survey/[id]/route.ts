import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getRegistrationById,
  getDemoSlotById,
  getSurveyByRegistrationId,
  createSurveyResponse,
} from '@neram/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    // Get registration
    const registration = await getRegistrationById(id, supabase);
    if (!registration) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    // Check if already submitted
    const existingSurvey = await getSurveyByRegistrationId(id, supabase);
    if (existingSurvey) {
      return NextResponse.json(
        { error: 'Survey already submitted', alreadySubmitted: true },
        { status: 400 }
      );
    }

    // Get slot details
    const slot = await getDemoSlotById(registration.slot_id, supabase);
    if (!slot) {
      return NextResponse.json(
        { error: 'Demo class not found' },
        { status: 404 }
      );
    }

    // Format date and time
    const slotDate = new Date(slot.slot_date).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const [hours, minutes] = slot.slot_time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const slotTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;

    return NextResponse.json({
      registration: {
        name: registration.name,
        slotDate,
        slotTime,
      },
    });
  } catch (error) {
    console.error('Error fetching survey data:', error);
    return NextResponse.json(
      { error: 'Failed to load survey' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Check if registration exists
    const registration = await getRegistrationById(id, supabase);
    if (!registration) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    // Check if already submitted
    const existingSurvey = await getSurveyByRegistrationId(id, supabase);
    if (existingSurvey) {
      return NextResponse.json(
        { error: 'Survey already submitted' },
        { status: 400 }
      );
    }

    // Create survey
    const survey = await createSurveyResponse(
      {
        registration_id: id,
        overall_rating: body.overall_rating,
        teaching_rating: body.teaching_rating,
        nps_score: body.nps_score,
        liked_most: body.liked_most,
        suggestions: body.suggestions,
        enrollment_interest: body.enrollment_interest,
        additional_comments: body.additional_comments,
        contact_for_followup: body.contact_for_followup !== false,
      },
      supabase
    );

    return NextResponse.json({ success: true, surveyId: survey.id });
  } catch (error) {
    console.error('Error submitting survey:', error);
    return NextResponse.json(
      { error: 'Failed to submit survey' },
      { status: 500 }
    );
  }
}

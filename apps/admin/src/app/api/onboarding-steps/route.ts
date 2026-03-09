// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listOnboardingStepDefinitions,
  createOnboardingStepDefinition,
} from '@neram/database';

// GET /api/onboarding-steps - List all step definitions
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const steps = await listOnboardingStepDefinitions(supabase);

    return NextResponse.json({ success: true, data: steps });
  } catch (error) {
    console.error('Error listing onboarding steps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding steps' },
      { status: 500 }
    );
  }
}

// POST /api/onboarding-steps - Create a new step definition
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      step_key,
      title,
      description,
      icon_name,
      action_type,
      action_config,
      display_order,
      is_active,
      is_required,
      applies_to,
    } = body;

    if (!step_key || !title) {
      return NextResponse.json(
        { error: 'step_key and title are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const step = await createOnboardingStepDefinition(
      { step_key, title, description, icon_name, action_type, action_config, display_order, is_active, is_required, applies_to },
      supabase
    );

    return NextResponse.json({ success: true, data: step });
  } catch (error: any) {
    console.error('Error creating onboarding step:', error);
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'A step with this key already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create onboarding step' },
      { status: 500 }
    );
  }
}

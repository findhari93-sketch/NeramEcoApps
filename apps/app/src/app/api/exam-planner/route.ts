// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserExamPreferences,
  saveUserExamPreferences,
  deleteUserExamPreferences,
  getUserReward,
  grantReward,

} from '@neram/database';
import type { ExamPhase, ExamTimeSlot } from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

// Phase 1 date range
const PHASE_1_START = '2026-04-04';
const PHASE_1_END = '2026-06-13';
// Phase 2 dates
const PHASE_2_DATES = ['2026-08-07', '2026-08-08'];

const REWARD_TYPE = 'exam_planner_completed';
const REWARD_POINTS = 5;

async function verifyUser(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const idToken = authHeader.slice(7);
    const decodedToken = await verifyIdToken(idToken);
    return { uid: decodedToken.uid };
  } catch {
    return null;
  }
}

async function getSupabaseUserId(firebaseUid: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('firebase_uid', firebaseUid)
    .maybeSingle();
  return (data as { id: string } | null)?.id || null;
}

function validateSelections(
  phase: ExamPhase,
  selections: { exam_date: string; time_slot: ExamTimeSlot }[]
): string | null {
  if (phase === 'phase_1') {
    if (selections.length > 2) return 'Maximum 2 selections for Phase 1';
    for (const s of selections) {
      if (s.exam_date < PHASE_1_START || s.exam_date > PHASE_1_END) {
        return `Date ${s.exam_date} is not in Phase 1 range`;
      }
    }
  } else if (phase === 'phase_2') {
    if (selections.length > 1) return 'Maximum 1 selection for Phase 2';
    for (const s of selections) {
      if (!PHASE_2_DATES.includes(s.exam_date)) {
        return `Date ${s.exam_date} is not a Phase 2 date`;
      }
    }
  } else {
    return 'Invalid phase';
  }

  for (const s of selections) {
    if (!['morning', 'afternoon'].includes(s.time_slot)) {
      return `Invalid time slot: ${s.time_slot}`;
    }
  }

  return null;
}

// GET /api/exam-planner — fetch user's preferences + reward status
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getSupabaseUserId(user.uid);
    if (!userId) {
      return NextResponse.json({ preferences: [], reward: null });
    }

    const supabase = getSupabaseAdminClient();
    const [preferences, reward] = await Promise.all([
      getUserExamPreferences(userId, undefined, supabase),
      getUserReward(userId, REWARD_TYPE, supabase),
    ]);

    return NextResponse.json({ preferences, reward });
  } catch (err) {
    console.error('Error fetching exam planner data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch planner data' },
      { status: 500 }
    );
  }
}

// POST /api/exam-planner — save preferences
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getSupabaseUserId(user.uid);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { phase, selections } = body;

    if (!phase || !Array.isArray(selections)) {
      return NextResponse.json(
        { error: 'phase and selections[] are required' },
        { status: 400 }
      );
    }

    if (selections.length === 0) {
      return NextResponse.json(
        { error: 'At least one selection is required' },
        { status: 400 }
      );
    }

    const validationError = validateSelections(phase, selections);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

        { status: 404 }
      );
    }

    // Save preferences
    const preferences = await saveUserExamPreferences(
      userId,
      
      phase,
      selections,
      supabase
    );

    // Grant reward (idempotent)
    const { reward, isNew } = await grantReward(
      userId,
      REWARD_TYPE,
      REWARD_POINTS,
      { phase, selection_count: selections.length },
      supabase
    );

    return NextResponse.json(
      { preferences, reward, rewardIsNew: isNew },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error saving exam planner data:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save planner data' },
      { status: 500 }
    );
  }
}

// DELETE /api/exam-planner — clear all preferences
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getSupabaseUserId(user.uid);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const supabase = getSupabaseAdminClient();
    await deleteUserExamPreferences(userId, undefined, supabase);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting exam planner data:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear planner data' },
      { status: 500 }
    );
  }
}

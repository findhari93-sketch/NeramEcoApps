// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getUserExamDetails,
  saveExamDetails,
  updateAttemptStatus,
} from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

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

// GET /api/exam-details — get user's exam profile + attempts
export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await getSupabaseUserId(user.uid);
    if (!userId) {
      return NextResponse.json({ profile: null, attempts: [] });
    }

    const supabase = getSupabaseAdminClient();
    const details = await getUserExamDetails(userId, supabase);

    return NextResponse.json(details);
  } catch (err) {
    console.error('Error fetching exam details:', err);
    return NextResponse.json(
      { error: 'Failed to fetch exam details' },
      { status: 500 }
    );
  }
}

// POST /api/exam-details — save exam details (intent + sessions + city)
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

    if (!body.nata_status) {
      return NextResponse.json(
        { error: 'nata_status is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const profile = await saveExamDetails(userId, body, supabase);

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    console.error('Error saving exam details:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save exam details' },
      { status: 500 }
    );
  }
}

// PATCH /api/exam-details — update attempt status
export async function PATCH(request: NextRequest) {
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

    if (!body.attempt_id || !body.status) {
      return NextResponse.json(
        { error: 'attempt_id and status are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    await updateAttemptStatus(body.attempt_id, userId, body.status, supabase);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating attempt status:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 500 }
    );
  }
}

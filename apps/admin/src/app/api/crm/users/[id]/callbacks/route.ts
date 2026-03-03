// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, scheduleCallback } from '@neram/database';

/**
 * GET /api/crm/users/[id]/callbacks
 * Return callback requests + attempts for a user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdminClient();

    // Fetch callback requests
    const { data: callbackRequests, error: reqErr } = await supabase
      .from('callback_requests')
      .select('*')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false });

    if (reqErr) throw reqErr;

    // Fetch callback attempts
    const { data: callbackAttempts, error: attErr } = await supabase
      .from('callback_attempts')
      .select('*')
      .eq('user_id', params.id)
      .order('attempted_at', { ascending: false });

    if (attErr) throw attErr;

    return NextResponse.json({
      callbackRequests: callbackRequests || [],
      callbackAttempts: callbackAttempts || [],
    });
  } catch (error: any) {
    console.error('CRM callbacks fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch callbacks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crm/users/[id]/callbacks
 * Schedule a new callback for a user.
 * Body: { scheduledAt: string, notes?: string, adminId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { scheduledAt, notes, adminId } = body;

    if (!scheduledAt || !adminId) {
      return NextResponse.json(
        { error: 'scheduledAt and adminId are required' },
        { status: 400 }
      );
    }

    // Validate adminId is a valid UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID). Admin profile may not be resolved yet.' },
        { status: 400 }
      );
    }

    const callback = await scheduleCallback(
      params.id,
      adminId,
      scheduledAt,
      notes
    );

    return NextResponse.json({ success: true, callback });
  } catch (error: any) {
    console.error('CRM callback schedule error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to schedule callback' },
      { status: 500 }
    );
  }
}
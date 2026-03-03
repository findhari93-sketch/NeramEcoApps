export const dynamic = 'force-dynamic';

/**
 * Score Calculations API
 *
 * POST /api/score-calculations  — Auto-save a new calculation (called from calculator)
 * GET  /api/score-calculations  — Get user's calculation history
 *                                 ?tool=cutoff_calculator&limit=50
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  saveScoreCalculation,
  getUserScoreCalculations,
  getSupabaseAdminClient,
} from '@neram/database';
import { getCorsHeaders } from '@/lib/cors';

async function resolveUser(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const idToken = authHeader?.replace('Bearer ', '');
  if (!idToken) return null;

  try {
    const decoded = await verifyIdToken(idToken);
    const user = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
    return user ?? null;
  } catch {
    return null;
  }
}

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { toolName, inputData, resultData, academicYear } = body;

    if (!toolName || !inputData || !resultData) {
      return NextResponse.json(
        { error: 'toolName, inputData, and resultData are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const calc = await saveScoreCalculation({
      userId: user.id,
      toolName,
      inputData,
      resultData,
      academicYear: academicYear ?? undefined,
    });

    return NextResponse.json(
      { success: true, calculation: calc },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    console.error('Score calculations POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save calculation' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  try {
    const user = await resolveUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(req.url);
    const toolName = searchParams.get('tool') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    const result = await getUserScoreCalculations(user.id, { toolName, limit });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error('Score calculations GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calculations' },
      { status: 500, headers: corsHeaders }
    );
  }
}
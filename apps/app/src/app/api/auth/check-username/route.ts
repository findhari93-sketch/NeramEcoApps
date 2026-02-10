/**
 * Check Username Availability API
 *
 * GET - Check if a username is available
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkUsernameAvailable, suggestUsernames } from '@neram/database';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/auth/check-username?username=xxx&excludeUserId=xxx
 * Check if username is available
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const excludeUserId = searchParams.get('excludeUserId');

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_.]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        {
          available: false,
          error: 'Username must be 3-30 characters, alphanumeric with underscores or dots only',
          suggestions: [],
        },
        { headers: corsHeaders }
      );
    }

    // Check availability
    const isAvailable = await checkUsernameAvailable(
      username,
      excludeUserId || undefined
    );

    // If not available, get suggestions
    let suggestions: string[] = [];
    if (!isAvailable) {
      try {
        suggestions = await suggestUsernames(username, 3);
      } catch (e) {
        console.warn('Failed to get username suggestions:', e);
      }
    }

    return NextResponse.json(
      {
        username: username.toLowerCase(),
        available: isAvailable,
        suggestions,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error checking username:', error);
    return NextResponse.json(
      { error: 'Failed to check username availability' },
      { status: 500, headers: corsHeaders }
    );
  }
}

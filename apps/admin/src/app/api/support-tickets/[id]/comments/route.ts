// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getTicketComments,
  addTicketComment,
} from '@neram/database';

// GET /api/support-tickets/[id]/comments - List comments for a ticket
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const comments = await getTicketComments(id, supabase);

    return NextResponse.json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error('Error fetching ticket comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ticket comments' },
      { status: 500 }
    );
  }
}

// POST /api/support-tickets/[id]/comments - Add admin comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, adminName } = body;

    if (!content || !adminName) {
      return NextResponse.json(
        { error: 'Missing required fields: content, adminName' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const comment = await addTicketComment(
      {
        ticket_id: id,
        user_name: adminName,
        is_admin: true,
        content,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      data: comment,
    });
  } catch (error) {
    console.error('Error adding ticket comment:', error);
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

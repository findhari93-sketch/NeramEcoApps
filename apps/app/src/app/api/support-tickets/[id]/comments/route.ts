export const dynamic = 'force-dynamic';

/**
 * Support Ticket Comments API
 *
 * POST /api/support-tickets/[id]/comments - Add a comment to a ticket (Firebase auth required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getSupportTicketById,
  addTicketComment,
} from '@neram/database';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string; userName: string } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return {
      userId: dbUser.id,
      userName: dbUser.name || dbUser.first_name || 'Unknown',
    };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/support-tickets/[id]/comments
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Get the ticket and verify the user owns it
    const ticket = await getSupportTicketById(id, supabase);

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    if (ticket.user_id !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    // Add the comment (is_admin: false since this comes from the student app)
    const comment = await addTicketComment(
      {
        ticket_id: id,
        user_id: auth.userId,
        user_name: auth.userName,
        is_admin: false,
        content: content.trim(),
      },
      supabase,
    );

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error('Error adding ticket comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}

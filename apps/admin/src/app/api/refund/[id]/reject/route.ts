// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import {
  updateRefundRequestStatus,
  getRefundRequestById,
  notifyRefundRejected,
  getSupabaseAdminClient,
} from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adminId, adminNotes } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    if (!adminNotes || adminNotes.trim().length < 5) {
      return NextResponse.json(
        { error: 'Admin notes are required when rejecting (at least 5 characters)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Verify the request exists and is pending
    const existing = await getRefundRequestById(id, supabase);
    if (!existing) {
      return NextResponse.json({ error: 'Refund request not found' }, { status: 404 });
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot reject a request that is already ${existing.status}` },
        { status: 400 }
      );
    }

    // Reject
    const updated = await updateRefundRequestStatus(
      id,
      'rejected',
      adminId,
      adminNotes.trim(),
      supabase
    );

    // Get user details for notifications
    const { data: user } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, phone')
      .eq('id', existing.user_id)
      .single();

    if (user) {
      const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Student';

      // Dispatch notifications (non-blocking)
      notifyRefundRejected({
        userId: user.id,
        userName,
        phone: user.phone || '',
        email: user.email || '',
        refundAmount: Number(updated.refund_amount),
        paymentAmount: Number(updated.payment_amount),
        adminNotes: adminNotes.trim(),
        paymentId: updated.payment_id,
        leadProfileId: updated.lead_profile_id || undefined,
      }, supabase).catch((err) => {
        console.error('Failed to send refund rejected notifications:', err);
      });
    }

    return NextResponse.json({ success: true, refundRequest: updated });
  } catch (error) {
    console.error('Refund reject error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reject refund' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/student/fee-report
 * Student reports a payment with proof (screenshot/receipt).
 * Creates a payment record pending admin verification.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const amount = formData.get('amount') as string;
    const notes = formData.get('notes') as string | null;
    const proofFile = formData.get('proof') as File | null;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    let proofUrl: string | null = null;

    // Upload proof file if provided
    if (proofFile) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(proofFile.type)) {
        return NextResponse.json({ error: 'Proof must be an image (JPEG, PNG, WebP) or PDF' }, { status: 400 });
      }
      if (proofFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Proof file must be under 10MB' }, { status: 400 });
      }

      const ext = proofFile.name.split('.').pop() || 'jpg';
      const filePath = `payment-proofs/${user.id}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(await proofFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, buffer, { contentType: proofFile.type });

      if (uploadError) {
        console.error('Proof upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload proof' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
      proofUrl = urlData.publicUrl;
    }

    // Create a payment record with status 'pending' (admin must verify)
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        amount: parseFloat(amount),
        currency: 'INR',
        status: 'pending',
        payment_method: 'manual',
        description: notes || `Payment reported by student${proofUrl ? ' (proof attached)' : ''}`,
        screenshot_url: proofUrl,
        screenshot_verified: false,
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        proof_url: proofUrl,
      },
    });
  } catch (error: any) {
    console.error('Fee report POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to report payment' },
      { status: error.message?.includes('token') ? 401 : 500 }
    );
  }
}

/**
 * GET /api/student/fee-report
 * Returns the student's fee summary and payment history.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get student profile for fee summary
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('total_fee, fee_paid, fee_due')
      .eq('user_id', user.id)
      .maybeSingle();

    // Get payment history
    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, status, payment_method, notes, receipt_url, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      feeSummary: studentProfile ? {
        total_fee: studentProfile.total_fee || 0,
        fee_paid: studentProfile.fee_paid || 0,
        fee_due: studentProfile.fee_due || 0,
      } : null,
      payments: payments || [],
    });
  } catch (error: any) {
    console.error('Fee report GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch fee data' },
      { status: error.message?.includes('token') ? 401 : 500 }
    );
  }
}

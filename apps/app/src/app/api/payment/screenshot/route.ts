// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('screenshot') as File;
    const leadProfileId = formData.get('leadProfileId') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const utrNumber = formData.get('utrNumber') as string;
    const payerName = formData.get('payerName') as string;
    const paymentMethod = formData.get('paymentMethod') as string; // 'upi' or 'bank_transfer'

    if (!file || !leadProfileId || !amount) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Verify lead profile belongs to user
    const { data: leadProfile, error: leadError } = await supabase
      .from('lead_profiles')
      .select('id, final_fee, full_name, email')
      .eq('id', leadProfileId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !leadProfile) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Lead profile not found' },
        { status: 404 }
      );
    }

    // Upload screenshot to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `payment-screenshots/${user.id}/${leadProfileId}/${Date.now()}.${fileExt}`;

    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase
      .storage
      .from('application-documents')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Screenshot upload error:', uploadError);
      return NextResponse.json(
        { error: 'Upload Error', message: 'Failed to upload screenshot' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('application-documents')
      .getPublicUrl(fileName);

    // Create payment record with pending status (needs admin verification)
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      // @ts-ignore - Supabase types not generated
      .insert({
        lead_profile_id: leadProfileId,
        user_id: user.id,
        amount,
        payment_method: paymentMethod === 'upi' ? 'upi_direct' : 'bank_transfer',
        status: 'pending_verification',
        direct_payment_screenshot_url: publicUrl,
        direct_payment_utr: utrNumber || null,
        direct_payment_payer_name: payerName || null,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Payment record error:', paymentError);
      return NextResponse.json(
        { error: 'Database Error', message: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    // Store document reference
    await supabase
      .from('application_documents')
      // @ts-ignore - Supabase types not generated
      .insert({
        lead_profile_id: leadProfileId,
        document_type: 'payment_screenshot',
        file_url: publicUrl,
        file_name: file.name,
        is_verified: false,
      });

    // Create direct payment cashback claim (pending admin approval)
    await supabase
      .from('cashback_claims')
      // @ts-ignore - Supabase types not generated
      .upsert({
        lead_profile_id: leadProfileId,
        user_id: user.id,
        cashback_type: 'direct_payment',
        amount: 100, // Rs. 100 for direct payment
        status: 'pending',
        cashback_phone: leadProfile.email, // Will be updated after verification
      }, {
        onConflict: 'lead_profile_id,cashback_type',
      });

    // Update lead profile status
    await supabase
      .from('lead_profiles')
      // @ts-ignore - Supabase types not generated
      .update({
        status: 'payment_pending_verification',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadProfileId);

    // TODO: Notify admin about new payment to verify

    return NextResponse.json({
      success: true,
      message: 'Payment screenshot uploaded successfully. Our team will verify within 24 hours.',
      paymentId: payment.id,
      cashbackEligible: 100,
    });
  } catch (error) {
    console.error('Screenshot upload error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to process payment screenshot' },
      { status: 500 }
    );
  }
}

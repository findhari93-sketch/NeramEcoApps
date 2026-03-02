// @ts-nocheck
/**
 * POST /api/profile/documents
 * Upload Aadhar card and passport photo for post-enrollment profile completion
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSupabaseAdminClient, getUserByFirebaseUid } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await verifyIdToken(token);
    const supabase = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid, supabase);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get student profile
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!studentProfile) {
      return NextResponse.json({ error: 'Student profile not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const aadharFile = formData.get('aadhar') as File | null;
    const photoFile = formData.get('photo') as File | null;

    if (!aadharFile && !photoFile) {
      return NextResponse.json({ error: 'At least one document is required' }, { status: 400 });
    }

    const updateData: Record<string, any> = {};

    // Upload Aadhar card
    if (aadharFile) {
      const ext = aadharFile.name.split('.').pop() || 'jpg';
      const path = `documents/${user.id}/aadhar_${Date.now()}.${ext}`;
      const buffer = Buffer.from(await aadharFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(path, buffer, {
          contentType: aadharFile.type,
          upsert: true,
        });

      if (uploadError) {
        console.error('Aadhar upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload Aadhar card' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('user-documents')
        .getPublicUrl(path);

      updateData.aadhar_document_url = urlData.publicUrl;
    }

    // Upload passport photo
    if (photoFile) {
      const ext = photoFile.name.split('.').pop() || 'jpg';
      const path = `documents/${user.id}/passport_photo_${Date.now()}.${ext}`;
      const buffer = Buffer.from(await photoFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(path, buffer, {
          contentType: photoFile.type,
          upsert: true,
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        return NextResponse.json({ error: 'Failed to upload photograph' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('user-documents')
        .getPublicUrl(path);

      updateData.passport_photo_url = urlData.publicUrl;
    }

    // Mark form as completed if both uploaded
    if (aadharFile && photoFile) {
      updateData.form_completed = true;
      updateData.form_completed_at = new Date().toISOString();
    }

    // Update post_enrollment_details
    const { error: updateError } = await supabase
      .from('post_enrollment_details')
      .update(updateData)
      .eq('student_profile_id', studentProfile.id);

    if (updateError) {
      // If no row exists yet, insert one
      await supabase
        .from('post_enrollment_details')
        .upsert({
          student_profile_id: studentProfile.id,
          user_id: user.id,
          ...updateData,
        }, { onConflict: 'student_profile_id' });
    }

    return NextResponse.json({
      success: true,
      message: 'Documents uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading documents:', error);
    return NextResponse.json(
      { error: 'Failed to upload documents' },
      { status: 500 }
    );
  }
}

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to upload documents' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('type') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'File size exceeds 5MB limit' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Invalid file type. Allowed: JPEG, PNG, WebP, HEIC, PDF' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${documentType}/${Date.now()}.${fileExt}`;

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('application-documents')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Upload Error', message: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('application-documents')
      .getPublicUrl(fileName);

    // Store document reference in database
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (leadProfile) {
      await supabase
        .from('application_documents')
        // @ts-ignore - Supabase types not generated
        .insert({
          lead_profile_id: leadProfile.id,
          document_type: documentType,
          file_url: publicUrl,
          file_name: file.name,
          is_verified: false,
        });
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: uploadData.path,
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

/**
 * POST /api/scholarship/upload
 * Upload a document for scholarship application to Supabase storage.
 *
 * Expects multipart form data with:
 *   - file: The file to upload (JPG, PNG, PDF, max 5MB)
 *   - type: Document type ('school_id_card' | 'income_certificate' | 'aadhar_card' | 'mark_sheet')
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getSupabaseAdminClient } from '@neram/database';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // Already initialized
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_DOC_TYPES = ['school_id_card', 'income_certificate', 'aadhar_card', 'mark_sheet'];

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await getAuth().verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();

    // Get user
    const { data: user } = await (adminClient
      .from('users') as any)
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const docType = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
      return NextResponse.json(
        { error: `Invalid document type. Must be one of: ${ALLOWED_DOC_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file format. Only JPG, PNG, and PDF are accepted.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File is too large. Maximum 5MB allowed.' },
        { status: 400 }
      );
    }

    // Generate storage path
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const timestamp = Date.now();
    const storagePath = `scholarship/${user.id}/${docType}_${timestamp}.${ext}`;

    // Upload to Supabase storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { data: uploadData, error: uploadError } = await adminClient
      .storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file. Please try again.' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = adminClient
      .storage
      .from('documents')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
      type: docType,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
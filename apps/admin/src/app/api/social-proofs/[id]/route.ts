// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getSocialProofById,
  updateSocialProof,
  deleteSocialProof,
} from '@neram/database';

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// GET /api/social-proofs/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();
    const data = await getSocialProofById(id, client);

    if (!data) {
      return NextResponse.json(
        { error: 'Social proof not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching social proof:', error);
    return NextResponse.json(
      { error: 'Failed to fetch social proof' },
      { status: 500 }
    );
  }
}

// PATCH /api/social-proofs/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'youtube_url',
      'audio_url',
      'audio_duration',
      'image_url',
      'speaker_name',
      'student_name',
      'parent_photo',
      'batch',
      'language',
      'description',
      'caption',
      'is_featured',
      'is_homepage',
      'display_order',
      'is_active',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate language if provided
    const validLanguages = ['tamil', 'english', 'hindi', 'kannada', 'malayalam', 'telugu'];
    if (updates.language && !validLanguages.includes(updates.language as string)) {
      return NextResponse.json(
        { error: `language must be one of: ${validLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    // Re-extract YouTube ID if URL changed
    if (updates.youtube_url) {
      updates.youtube_id = extractYoutubeId(updates.youtube_url as string);
    }

    const client = getSupabaseAdminClient();
    const data = await updateSocialProof(id, updates, client);

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to update social proof' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Error updating social proof:', error);
    let message = 'Failed to update social proof';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/social-proofs/[id] - Soft-delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getSupabaseAdminClient();
    const success = await deleteSocialProof(id, client);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete social proof' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting social proof:', error);
    let message = 'Failed to delete social proof';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

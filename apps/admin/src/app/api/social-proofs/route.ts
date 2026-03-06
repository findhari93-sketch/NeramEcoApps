// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listSocialProofsAdmin,
  createSocialProof,
  getSocialProofStats,
} from '@neram/database';
import type { SocialProofType, SocialProofLanguage } from '@neram/database';

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

// GET /api/social-proofs - List with filters + stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || undefined;
    const proof_type = searchParams.get('proof_type') as SocialProofType | undefined;
    const language = searchParams.get('language') as SocialProofLanguage | undefined;
    const is_active = searchParams.get('is_active') !== null
      ? searchParams.get('is_active') === 'true'
      : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;
    const include_stats = searchParams.get('include_stats') === 'true';

    const client = getSupabaseAdminClient();

    const result = await listSocialProofsAdmin(
      { search, proof_type, language, is_active, limit, offset },
      client
    );

    let stats = null;
    if (include_stats) {
      stats = await getSocialProofStats(client);
    }

    return NextResponse.json({ data: result.data, count: result.count, stats });
  } catch (error) {
    console.error('Error listing social proofs:', error);
    return NextResponse.json(
      { error: 'Failed to list social proofs' },
      { status: 500 }
    );
  }
}

// POST /api/social-proofs - Create a new social proof
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      proof_type,
      youtube_url,
      audio_url,
      audio_duration,
      image_url,
      speaker_name,
      student_name,
      parent_photo,
      batch,
      language,
      description,
      caption,
      is_featured,
      is_homepage,
      display_order,
      is_active,
    } = body;

    // Validate required fields
    if (!proof_type || !speaker_name) {
      return NextResponse.json(
        { error: 'Required fields: proof_type, speaker_name' },
        { status: 400 }
      );
    }

    // Validate proof_type
    if (!['video', 'audio', 'screenshot'].includes(proof_type)) {
      return NextResponse.json(
        { error: 'proof_type must be one of: video, audio, screenshot' },
        { status: 400 }
      );
    }

    // Validate language
    const validLanguages = ['tamil', 'english', 'hindi', 'kannada', 'malayalam', 'telugu'];
    if (language && !validLanguages.includes(language)) {
      return NextResponse.json(
        { error: `language must be one of: ${validLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    // Extract YouTube ID if URL provided
    let youtube_id = null;
    if (youtube_url) {
      youtube_id = extractYoutubeId(youtube_url);
    }

    const client = getSupabaseAdminClient();

    const data = await createSocialProof(
      {
        proof_type,
        youtube_url: youtube_url || null,
        youtube_id,
        audio_url: audio_url || null,
        audio_duration: audio_duration != null ? Number(audio_duration) : null,
        image_url: image_url || null,
        speaker_name,
        student_name: student_name || null,
        parent_photo: parent_photo || null,
        batch: batch || null,
        language: language || 'tamil',
        description: description || {},
        caption: caption || null,
        is_featured: is_featured ?? false,
        is_homepage: is_homepage ?? false,
        display_order: display_order ?? 0,
        is_active: is_active ?? true,
      },
      client
    );

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create social proof' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating social proof:', error);
    return NextResponse.json(
      { error: 'Failed to create social proof' },
      { status: 500 }
    );
  }
}

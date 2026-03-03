export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { listMarketingContent, createMarketingContent } from '@neram/database';

// GET /api/marketing-content - List all marketing content
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as any;
    const status = searchParams.get('status') as any;

    const options: { type?: string; status?: string } = {};
    if (type) options.type = type;
    if (status) options.status = status;

    const data = await listMarketingContent(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing marketing content:', error);
    return NextResponse.json(
      { error: 'Failed to list marketing content' },
      { status: 500 }
    );
  }
}

// POST /api/marketing-content - Create marketing content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type, title, description, image_url, metadata,
      status, is_pinned, display_priority,
      starts_at, expires_at, created_by,
    } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: 'type and title are required' },
        { status: 400 }
      );
    }

    const data = await createMarketingContent({
      type,
      title: title || {},
      description: description || {},
      image_url: image_url || null,
      metadata: metadata || {},
      status: status || 'draft',
      is_pinned: is_pinned || false,
      display_priority: display_priority || 0,
      starts_at: starts_at || null,
      expires_at: expires_at || null,
      published_at: status === 'published' ? new Date().toISOString() : null,
      created_by: created_by || null,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating marketing content:', error);
    return NextResponse.json(
      { error: 'Failed to create marketing content' },
      { status: 500 }
    );
  }
}
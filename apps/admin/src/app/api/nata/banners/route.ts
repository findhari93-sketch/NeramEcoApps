// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listNataBanners, createNataBanner } from '@neram/database';

// GET /api/nata/banners - List all NATA banners
export async function GET() {
  try {
    const data = await listNataBanners();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing NATA banners:', error);
    return NextResponse.json(
      { error: 'Failed to list NATA banners' },
      { status: 500 }
    );
  }
}

// POST /api/nata/banners - Create a NATA banner
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      spot, heading, subtext, image_url, mobile_image_url,
      cta_text, cta_link, is_active, start_date, end_date, display_order,
    } = body;

    if (!spot || !heading?.en) {
      return NextResponse.json(
        { error: 'spot and heading.en are required' },
        { status: 400 }
      );
    }

    const data = await createNataBanner({
      spot,
      heading: heading || {},
      subtext: subtext || {},
      image_url: image_url || null,
      mobile_image_url: mobile_image_url || null,
      cta_text: cta_text || {},
      cta_link: cta_link || null,
      is_active: is_active ?? true,
      start_date: start_date || null,
      end_date: end_date || null,
      display_order: display_order ?? 0,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating NATA banner:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create NATA banner';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

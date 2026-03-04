// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listNataBrochures, createNataBrochure } from '@neram/database';

// GET /api/nata/brochures - List all NATA brochures
export async function GET() {
  try {
    const data = await listNataBrochures();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing NATA brochures:', error);
    return NextResponse.json(
      { error: 'Failed to list NATA brochures' },
      { status: 500 }
    );
  }
}

// POST /api/nata/brochures - Create a NATA brochure
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      version, release_date, year, file_url, file_size_bytes,
      changelog, is_current, is_active, display_order, uploaded_by,
    } = body;

    if (!version || !file_url) {
      return NextResponse.json(
        { error: 'version and file_url are required' },
        { status: 400 }
      );
    }

    const data = await createNataBrochure({
      version,
      release_date: release_date || new Date().toISOString().slice(0, 10),
      year: year || new Date().getFullYear(),
      file_url,
      file_size_bytes: file_size_bytes || null,
      changelog: changelog || null,
      is_current: is_current ?? false,
      is_active: is_active ?? true,
      display_order: display_order ?? 0,
      uploaded_by: uploaded_by || null,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating NATA brochure:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create NATA brochure';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listNataAnnouncements, createNataAnnouncement } from '@neram/database';

// GET /api/nata/announcements - List all NATA announcements
export async function GET() {
  try {
    const data = await listNataAnnouncements();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing NATA announcements:', error);
    return NextResponse.json(
      { error: 'Failed to list NATA announcements' },
      { status: 500 }
    );
  }
}

// POST /api/nata/announcements - Create a NATA announcement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      text, link, bg_color, text_color, severity,
      year, is_active, start_date, end_date, priority,
    } = body;

    if (!text?.en) {
      return NextResponse.json(
        { error: 'text.en is required' },
        { status: 400 }
      );
    }

    const data = await createNataAnnouncement({
      text: text || {},
      link: link || null,
      bg_color: bg_color || '#e3f2fd',
      text_color: text_color || '#1565c0',
      severity: severity || 'info',
      year: year || new Date().getFullYear(),
      is_active: is_active ?? true,
      start_date: start_date || null,
      end_date: end_date || null,
      priority: priority ?? 0,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating NATA announcement:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create NATA announcement';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { addAdminNote, getAdminNotes } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const notes = await getAdminNotes(params.id);
    return NextResponse.json({ notes });
  } catch (error: any) {
    console.error('CRM notes fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { note, adminId, adminName } = body;

    if (!note || !adminId) {
      return NextResponse.json(
        { error: 'note and adminId are required' },
        { status: 400 }
      );
    }

    // Validate adminId is a valid UUID (Supabase user ID, not MS OID or email)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID). Admin profile may not be resolved yet.' },
        { status: 400 }
      );
    }

    const created = await addAdminNote(
      params.id,
      adminId,
      adminName || 'Admin',
      note
    );

    return NextResponse.json({ success: true, note: created });
  } catch (error: any) {
    console.error('CRM note create error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create note' },
      { status: 500 }
    );
  }
}

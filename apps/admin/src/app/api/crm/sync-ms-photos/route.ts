// @ts-nocheck
export const dynamic = 'force-dynamic';
// A full backfill fetches one Graph photo per user; bounded concurrency in the
// lib keeps it under this ceiling even for a few hundred users.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { syncMsPhotosBulk } from '@/lib/ms-photo-sync';

/**
 * POST /api/crm/sync-ms-photos
 * Pull Microsoft Graph profile photos into our DB and update users.avatar_url.
 * Body (optional): { userIds?: string[] }  -> default syncs every user with an ms_oid.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userIds = Array.isArray(body?.userIds) ? body.userIds : undefined;

    const summary = await syncMsPhotosBulk(userIds);

    if (summary.configError) {
      return NextResponse.json({ success: false, ...summary }, { status: 502 });
    }
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error('CRM sync-ms-photos error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync Microsoft photos' }, { status: 500 });
  }
}

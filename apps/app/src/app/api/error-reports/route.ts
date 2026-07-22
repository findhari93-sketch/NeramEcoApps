export const dynamic = 'force-dynamic';

/**
 * Student PWA error report (Firebase auth) → the SINGLE Nexus staff inbox.
 *
 * POST /api/error-reports
 * Writes into `nexus_foundation_issues` via the shared createFoundationIssue
 * query (source_app='app'), so app + nexus reports land in one place
 * (Nexus /teacher/issues). Body:
 *   { title, description?, category?, page_url?, screenshot_urls?,
 *     device_info?, console_logs? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getUserByFirebaseUid, getSupabaseAdminClient, createAdminNotification } from '@neram/database';
import { createFoundationIssue } from '@neram/database/queries/nexus';
import type { FoundationIssueCategory } from '@neram/database/types';

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string; userName: string } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return { userId: dbUser.id, userName: dbUser.name || dbUser.first_name || 'Student' };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

const VALID_CATEGORIES: FoundationIssueCategory[] = [
  'bug',
  'content_issue',
  'ui_ux',
  'feature_request',
  'class_schedule',
  'other',
];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const category: FoundationIssueCategory = VALID_CATEGORIES.includes(body.category)
      ? body.category
      : 'bug';

    const issue = await createFoundationIssue({
      student_id: auth.userId,
      title: body.title.trim(),
      description: (body.description || '').trim(),
      category,
      page_url: body.page_url || undefined,
      screenshot_urls: Array.isArray(body.screenshot_urls) ? body.screenshot_urls : undefined,
      console_logs: Array.isArray(body.console_logs) ? body.console_logs : undefined,
      device_info: body.device_info && typeof body.device_info === 'object' ? body.device_info : undefined,
      source_app: 'app',
    });

    // Notify staff in the same way the Nexus report flow does.
    try {
      await createAdminNotification({
        event_type: 'foundation_issue_reported',
        title: `New Ticket ${issue.ticket_number}`,
        message: `${auth.userName} (app) reported: "${body.title.trim()}"`,
        metadata: {
          issue_id: issue.id,
          ticket_number: issue.ticket_number,
          student_name: auth.userName,
          category,
          source_app: 'app',
        },
      });
    } catch (notifErr) {
      console.error('[error-reports] notification failed:', notifErr);
    }

    return NextResponse.json({ ticket_number: issue.ticket_number, issue_id: issue.id }, { status: 201 });
  } catch (error) {
    console.error('[error-reports] failed to create report:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}

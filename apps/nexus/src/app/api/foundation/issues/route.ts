import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createFoundationIssue,
  getStudentFoundationIssues,
  getAllFoundationIssues,
} from '@neram/database/queries/nexus';
import { createAdminNotification } from '@neram/database/queries';
import type { FoundationIssueStatus } from '@neram/database/types';

/**
 * GET /api/foundation/issues?status=open|in_progress|resolved&assigned_to=userId
 * Students: get own issues. Teachers: get all issues.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const status = request.nextUrl.searchParams.get('status') as FoundationIssueStatus | null;
    const assignedTo = request.nextUrl.searchParams.get('assigned_to');

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type === 'teacher' || user.user_type === 'admin') {
      const filters: { status?: FoundationIssueStatus; assigned_to?: string } = {};
      if (status) filters.status = status;
      if (assignedTo) filters.assigned_to = assignedTo;

      const issues = await getAllFoundationIssues(
        Object.keys(filters).length > 0 ? filters : undefined
      );
      return NextResponse.json({ issues });
    }

    const issues = await getStudentFoundationIssues(user.id);
    return NextResponse.json({ issues });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load issues';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/foundation/issues
 * Body: { chapter_id, section_id?, title, description }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (!body.chapter_id || !body.title?.trim()) {
      return NextResponse.json({ error: 'chapter_id and title are required' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get chapter title for notification
    const { data: chapter } = await supabase
      .from('nexus_foundation_chapters')
      .select('title, chapter_number')
      .eq('id', body.chapter_id)
      .single();

    const issue = await createFoundationIssue({
      student_id: user.id,
      chapter_id: body.chapter_id,
      section_id: body.section_id || undefined,
      title: body.title.trim(),
      description: (body.description || '').trim(),
    });

    // Notify teachers/admins about the new issue
    try {
      await createAdminNotification({
        event_type: 'foundation_issue_reported',
        title: 'New Issue Reported',
        message: `${user.name} reported: "${body.title.trim()}" on Ch ${chapter?.chapter_number || '?'}: ${chapter?.title || 'Unknown'}`,
        metadata: {
          issue_id: issue.id,
          student_name: user.name,
          chapter_title: chapter?.title || '',
          chapter_number: chapter?.chapter_number || 0,
        },
      });
    } catch (notifErr) {
      console.error('Failed to send issue reported notification:', notifErr);
    }

    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

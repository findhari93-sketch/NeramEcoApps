export const dynamic = 'force-dynamic';

/**
 * App Feedback API
 *
 * POST /api/feedback - Submit feedback (public, no auth required)
 *
 * Optional `topics`: slugs from FEEDBACK_TOPICS (lib/learner-feedback). Emits
 * feedback_submitted (funnel feedback) server-side, best effort.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createAppFeedback,
  createAdminNotification,
  insertFunnelEvent,
} from '@neram/database';
import type { AppFeedbackCategory, UserFunnelEventInsert } from '@neram/database';
import { parseFeedbackTopics } from '@/lib/learner-feedback';

const VALID_CATEGORIES: AppFeedbackCategory[] = [
  'bug_report',
  'feature_request',
  'ui_ux_issue',
  'performance',
  'other',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rating, category, description, app_version, device_info, email, topics: rawTopics } = body;

    // Validate required fields
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be a number between 1 and 5' }, { status: 400 });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return NextResponse.json({ error: 'description must be at least 10 characters' }, { status: 400 });
    }
    const parsedTopics = parseFeedbackTopics(rawTopics);
    if (!parsedTopics.ok) {
      return NextResponse.json({ error: 'Invalid topics', invalid: parsedTopics.invalid.slice(0, 5) }, { status: 400 });
    }
    const topics = parsedTopics.topics;

    // Optional auth — resolve user if token is present
    let userId: string | undefined;
    let userEmail: string | undefined;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = await verifyIdToken(token);
        const adminClient = getSupabaseAdminClient();
        const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
        if (dbUser) {
          userId = dbUser.id;
          userEmail = dbUser.email || undefined;
        }
      } catch {
        // Auth is optional — silently ignore failures
      }
    }

    const supabase = getSupabaseAdminClient();

    const feedback = await createAppFeedback(
      {
        user_id: userId,
        email: email || userEmail || undefined,
        rating,
        category: category as AppFeedbackCategory,
        description: description.trim(),
        app_version: app_version || undefined,
        device_info: device_info || {},
        source: 'play_store',
      },
      supabase,
    );

    // app_feedback.topics is newer than createAppFeedback, so it is written
    // separately. Best effort: a missing column must not lose the feedback.
    if (topics.length > 0) {
      const { error: topicsError } = await (supabase as any)
        .from('app_feedback')
        .update({ topics })
        .eq('id', feedback.id);
      if (topicsError) console.warn('[feedback] topics not saved:', topicsError.message);
    }

    // First-party event, best effort.
    try {
      const event: UserFunnelEventInsert = {
        user_id: userId ?? null,
        anonymous_id: null,
        session_id: null,
        funnel: 'feedback',
        event: 'feedback_submitted',
        status: 'completed',
        error_message: null,
        error_code: null,
        metadata: { kind: 'app_feedback', rating, category, topics },
        device_session_id: null,
        device_type: null,
        browser: null,
        os: null,
        ip_address: null,
        source_app: 'app',
        page_url: '/feedback',
      };
      await insertFunnelEvent(supabase, event);
    } catch (eventError) {
      console.warn('[feedback] feedback_submitted event not recorded:', eventError);
    }

    // Create admin notification (non-blocking)
    try {
      await createAdminNotification({
        event_type: 'feedback_submitted' as any,
        title: 'New App Feedback',
        message: `${rating}★ feedback: ${description.trim().slice(0, 80)}...`,
        metadata: {
          feedback_id: feedback.id,
          feedback_number: feedback.feedback_number,
          rating,
          category,
        },
      });
    } catch (notifError) {
      console.error('Failed to create admin notification for feedback:', notifError);
    }

    return NextResponse.json(
      {
        feedbackNumber: feedback.feedback_number,
        feedbackId: feedback.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}

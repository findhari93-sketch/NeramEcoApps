// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Funnel Events Queries
 *
 * Track auth, onboarding, and application funnel steps
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { UserFunnelEvent, UserFunnelEventInsert, AuthFunnelSummary } from '../types';

// Auth funnel event order (for determining "last step reached")
const AUTH_EVENT_ORDER: Record<string, number> = {
  'google_auth_started': 1,
  'google_auth_popup_opened': 2,
  'google_auth_completed': 3,
  'register_user_started': 4,
  'register_user_completed': 5,
  'phone_screen_shown': 6,
  'phone_number_entered': 7,
  'otp_requested': 8,
  'otp_entered': 9,
  'otp_verified': 10,
};

// Human-readable labels for events
const EVENT_LABELS: Record<string, string> = {
  'google_auth_started': 'Google Sign-in Started',
  'google_auth_popup_opened': 'Google Popup Opened',
  'google_auth_completed': 'Google Auth Completed',
  'google_auth_failed': 'Google Auth Failed',
  'register_user_started': 'User Registration Started',
  'register_user_completed': 'User Registered',
  'register_user_failed': 'Registration Failed',
  'phone_screen_shown': 'Phone Screen Shown',
  'phone_number_entered': 'Phone Number Entered',
  'otp_requested': 'OTP Requested',
  'otp_request_failed': 'OTP Request Failed',
  'otp_entered': 'OTP Entered',
  'otp_verified': 'Phone Verified',
  'otp_failed': 'OTP Failed',
  'phone_already_exists': 'Phone Already Registered',
  'phone_skipped': 'Phone Verification Skipped',
  'onboarding_started': 'Onboarding Started',
  'onboarding_question_answered': 'Question Answered',
  'onboarding_completed': 'Onboarding Completed',
  'onboarding_skipped': 'Onboarding Skipped',
  'application_step_started': 'Application Step Started',
  'application_step_completed': 'Application Step Completed',
  'application_submitted': 'Application Submitted',
};

export { AUTH_EVENT_ORDER, EVENT_LABELS };

/**
 * Insert a single funnel event
 */
export async function insertFunnelEvent(
  client: TypedSupabaseClient,
  data: UserFunnelEventInsert
): Promise<UserFunnelEvent | null> {
  const { data: event, error } = await client
    .from('user_funnel_events')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Failed to insert funnel event:', error);
    return null;
  }
  return event;
}

/**
 * Insert multiple funnel events in batch
 */
export async function insertFunnelEventsBatch(
  client: TypedSupabaseClient,
  events: UserFunnelEventInsert[]
): Promise<number> {
  if (events.length === 0) return 0;

  const { error } = await client
    .from('user_funnel_events')
    .insert(events);

  if (error) {
    console.error('Failed to insert funnel events batch:', error);
    return 0;
  }
  return events.length;
}

/**
 * Link anonymous events to a user after registration
 */
export async function linkAnonymousEvents(
  client: TypedSupabaseClient,
  anonymousId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('user_funnel_events')
    .update({ user_id: userId })
    .eq('anonymous_id', anonymousId)
    .is('user_id', null);

  if (error) {
    console.error('Failed to link anonymous events:', error);
  }
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Get all funnel events for a specific user (admin)
 */
export async function getFunnelEventsForUser(
  userId: string,
  limit = 200
): Promise<UserFunnelEvent[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_funnel_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Failed to get funnel events:', error);
    return [];
  }
  return data || [];
}

/**
 * Get auth funnel summary for the admin dashboard
 */
export async function getAuthFunnelSummary(
  days = 30,
  sourceApp?: string
): Promise<AuthFunnelSummary[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('auth_funnel_summary')
    .select('*')
    .gte('week', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  if (sourceApp) {
    query = query.eq('source_app', sourceApp);
  }

  const { data, error } = await query.order('week', { ascending: false });

  if (error) {
    console.error('Failed to get auth funnel summary:', error);
    return [];
  }
  return data || [];
}

/**
 * Get the last auth step + drop-off diagnosis for a user
 */
export async function getUserAuthDiagnostics(
  userId: string
): Promise<{
  lastEvent: string | null;
  lastStatus: string | null;
  lastErrorMessage: string | null;
  lastErrorCode: string | null;
  eventAt: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  dropOffReason: string | null;
} | null> {
  const supabase = getSupabaseAdminClient();
  const { data: events, error } = await supabase
    .from('user_funnel_events')
    .select('*')
    .eq('user_id', userId)
    .eq('funnel', 'auth')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !events || events.length === 0) return null;

  const lastEvent = events[0];

  // Determine drop-off reason
  let dropOffReason: string | null = null;
  const eventNames = events.map(e => e.event);
  const hasFailedEvent = events.find(e => e.status === 'failed');

  if (hasFailedEvent) {
    const label = EVENT_LABELS[hasFailedEvent.event] || hasFailedEvent.event;
    dropOffReason = hasFailedEvent.error_code
      ? `${label}: ${hasFailedEvent.error_code}`
      : `${label}: ${hasFailedEvent.error_message || 'Unknown error'}`;
  } else if (eventNames.includes('otp_verified')) {
    dropOffReason = null; // Completed successfully
  } else if (eventNames.includes('phone_skipped')) {
    dropOffReason = 'User skipped phone verification';
  } else if (eventNames.includes('otp_requested') && !eventNames.includes('otp_verified')) {
    dropOffReason = 'OTP sent but never verified. User may have left.';
  } else if (eventNames.includes('phone_number_entered') && !eventNames.includes('otp_requested')) {
    dropOffReason = 'Phone entered but OTP never requested';
  } else if (eventNames.includes('phone_screen_shown') && !eventNames.includes('phone_number_entered')) {
    dropOffReason = 'Saw phone screen but never entered a number';
  } else if (eventNames.includes('register_user_completed') && !eventNames.includes('phone_screen_shown')) {
    dropOffReason = 'Registered but never saw phone verification screen';
  } else if (eventNames.includes('google_auth_completed') && !eventNames.includes('register_user_completed')) {
    dropOffReason = 'Google auth completed but registration failed';
  }

  return {
    lastEvent: lastEvent.event,
    lastStatus: lastEvent.status,
    lastErrorMessage: lastEvent.error_message,
    lastErrorCode: lastEvent.error_code,
    eventAt: lastEvent.created_at,
    deviceType: lastEvent.device_type,
    browser: lastEvent.browser,
    os: lastEvent.os,
    dropOffReason,
  };
}

/**
 * Get auth diagnostics for multiple users at once (for leads table)
 */
export async function getBatchUserAuthDiagnostics(
  userIds: string[]
): Promise<Map<string, { lastEvent: string; lastStatus: string; dropOffReason: string | null; deviceType: string | null; browser: string | null }>> {
  if (userIds.length === 0) return new Map();

  const supabase = getSupabaseAdminClient();
  const { data: events, error } = await supabase
    .from('user_funnel_events')
    .select('user_id, event, status, error_message, error_code, device_type, browser, created_at')
    .in('user_id', userIds)
    .eq('funnel', 'auth')
    .order('created_at', { ascending: false });

  if (error || !events) return new Map();

  // Group by user and compute diagnostics
  const userEvents = new Map<string, typeof events>();
  for (const evt of events) {
    if (!evt.user_id) continue;
    if (!userEvents.has(evt.user_id)) {
      userEvents.set(evt.user_id, []);
    }
    userEvents.get(evt.user_id)!.push(evt);
  }

  const result = new Map<string, { lastEvent: string; lastStatus: string; dropOffReason: string | null; deviceType: string | null; browser: string | null }>();

  for (const [userId, evts] of userEvents) {
    const latest = evts[0];
    const eventNames = evts.map(e => e.event);
    const hasFailedEvent = evts.find(e => e.status === 'failed');

    let dropOffReason: string | null = null;

    if (hasFailedEvent) {
      dropOffReason = hasFailedEvent.error_code || hasFailedEvent.error_message || 'Error occurred';
    } else if (eventNames.includes('otp_verified')) {
      dropOffReason = null;
    } else if (eventNames.includes('phone_skipped')) {
      dropOffReason = 'Skipped phone verification';
    } else if (eventNames.includes('phone_screen_shown') && !eventNames.includes('phone_number_entered')) {
      dropOffReason = 'Left at phone screen';
    } else if (eventNames.includes('register_user_completed') && !eventNames.includes('phone_screen_shown')) {
      dropOffReason = 'Never saw phone screen';
    } else if (eventNames.includes('google_auth_completed')) {
      dropOffReason = 'Left after Google auth';
    }

    result.set(userId, {
      lastEvent: latest.event,
      lastStatus: latest.status,
      dropOffReason,
      deviceType: latest.device_type,
      browser: latest.browser,
    });
  }

  return result;
}

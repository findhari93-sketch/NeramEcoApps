/**
 * Shared three-tier nudge delivery.
 *
 * Extracted from /api/assignments/nudge so the photo-review queue and the
 * inactivity watchlist reach students through exactly the same channels, with
 * the same failure behaviour, instead of each route reinventing it (or worse,
 * one route HTTP-calling another).
 *
 * Delivery per recipient:
 *   1. A Microsoft Teams Activity-feed ping ("Neram Assistant") when
 *      TEAMS_APP_CATALOG_ID is configured and the student has a Microsoft
 *      identity. This lands in the Teams Activity feed (the bell), NOT in a 1:1
 *      chat, so templated reminders never clutter a real conversation.
 *   2. Always an in-app notification (the persistent record + the Nexus bell).
 *   3. An email backstop, ONLY when the Teams ping did not land, so
 *      Teams-reachable students are never double-messaged.
 *
 * Never throws. A recipient we could not reach comes back with ok: false and
 * channel 'failed', because a partial send must still report honestly rather
 * than fail the whole batch.
 */

import { getSupabaseAdminClient, sendEmail } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';

export interface NudgeResult {
  studentId: string;
  name: string | null;
  teams: boolean;
  inapp: boolean;
  email: boolean;
  ok: boolean;
  /** e.g. 'teams+inapp', 'inapp+email', or 'failed'. */
  channel: string;
}

export interface NudgeCounts {
  total: number;
  teams: number;
  inapp: number;
  email: number;
  failed: number;
}

export interface SendNudgeInput {
  studentIds: string[];
  /** In-app notification title and email subject. */
  subject: string;
  /** Plain-text body: the in-app message and the Teams preview line. */
  plain: string;
  /** HTML body for the email backstop. Falls back to the plain text. */
  html?: string;
  /** Short headline for the Teams activity feed. Falls back to `subject`. */
  teamsText?: string;
  /** notification_event_type value. Must already exist in the DB enum. */
  eventType: string;
  /** Extra JSONB stored on the notification row, e.g. { source: 'watchlist' }. */
  metadata?: Record<string, unknown>;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string),
  );
}

/** Wrap plain text in the standard email shell used by the nudge emails. */
export function plainToHtml(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escapeHtml(
    text,
  ).replace(/\n/g, '<br/>')}</div>`;
}

export async function sendNudge(
  input: SendNudgeInput,
): Promise<{ results: NudgeResult[]; counts: NudgeCounts }> {
  const { studentIds, subject, plain, eventType } = input;
  const html = input.html || plainToHtml(plain);
  const teamsText = input.teamsText || subject;
  const metadata = input.metadata || {};

  const supabase = getSupabaseAdminClient() as any;
  // When unset, the Teams tier is skipped and delivery is in-app + email. This
  // lets every nudge feature work before the one-time Teams admin setup is done.
  const catalogAppId = process.env.TEAMS_APP_CATALOG_ID || null;

  const [{ data: users }, { data: profiles }] = await Promise.all([
    supabase.from('users').select('id, name, email, ms_oid').in('id', studentIds),
    supabase.from('student_profiles').select('user_id, ms_teams_email').in('user_id', studentIds),
  ]);
  const usersBy = new Map<
    string,
    { id: string; name: string | null; email: string | null; ms_oid: string | null }
  >((users || []).map((u: any) => [u.id, u]));
  const teamsBy = new Map<string, string | null>(
    (profiles || []).map((p: any) => [p.user_id, p.ms_teams_email]),
  );

  // Process recipients in parallel to stay within the serverless time budget.
  const results = await Promise.all(
    studentIds.map(async (sid): Promise<NudgeResult> => {
      const u = usersBy.get(sid);
      if (!u) {
        return {
          studentId: sid,
          name: null,
          teams: false,
          inapp: false,
          email: false,
          ok: false,
          channel: 'none',
        };
      }

      // 1) Teams Activity-feed ping. ms_oid is preferred; the UPN
      //    (ms_teams_email) is a fallback identifier when the oid is missing.
      let teams = false;
      const teamsUserId = u.ms_oid || teamsBy.get(sid) || null;
      if (catalogAppId && teamsUserId) {
        const r = await sendTeamsActivityNotification(teamsUserId, {
          text: teamsText,
          preview: plain,
          catalogAppId,
        });
        teams = r.ok;
        // Never swallow a Teams failure: without this, a student who got only
        // the in-app row gives no clue why Teams did not land.
        if (!r.ok) console.error(`${eventType} teams send failed for ${sid}:`, r.reason);
      }

      // 2) Always record the in-app notification (persistent record + bell).
      let inapp = false;
      try {
        const { error } = await supabase.from('user_notifications').insert({
          user_id: sid,
          event_type: eventType,
          title: subject,
          message: plain,
          metadata,
          is_read: false,
        });
        if (error) console.error(`${eventType} notification insert failed:`, error.message);
        else inapp = true;
      } catch (e) {
        console.error(`${eventType} notification insert threw:`, e);
      }

      // 3) Email backstop, only when the Teams ping did not land.
      let email = false;
      if (!teams && u.email) {
        const r = await sendEmail({ to: u.email, subject, html }).catch(() => ({ success: false }));
        email = !!r.success;
      }

      const parts = [teams ? 'teams' : '', inapp ? 'inapp' : '', email ? 'email' : ''].filter(
        Boolean,
      );
      return {
        studentId: sid,
        name: u.name,
        teams,
        inapp,
        email,
        ok: parts.length > 0,
        channel: parts.length ? parts.join('+') : 'failed',
      };
    }),
  );

  return {
    results,
    counts: {
      total: results.length,
      teams: results.filter((r) => r.teams).length,
      inapp: results.filter((r) => r.inapp).length,
      email: results.filter((r) => r.email).length,
      failed: results.filter((r) => !r.ok).length,
    },
  };
}

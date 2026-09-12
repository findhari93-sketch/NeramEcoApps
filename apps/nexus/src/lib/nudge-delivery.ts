/**
 * Shared three-tier nudge delivery.
 *
 * Extracted from /api/assignments/nudge so the photo-review queue and the
 * inactivity watchlist reach students through exactly the same channels, with
 * the same failure behaviour, instead of each route reinventing it (or worse,
 * one route HTTP-calling another).
 *
 * Delivery per recipient:
 *   0. A real Teams 1:1 chat message, ONLY when the caller passes `chat` with a
 *      teacher's delegated token. Opt-in because it is only right for a message
 *      a person wrote to students they picked; a templated sweep posting into a
 *      genuine conversation is the clutter tier 1 exists to avoid.
 *   1. A Microsoft Teams Activity-feed ping ("Neram Assistant") when
 *      TEAMS_APP_CATALOG_ID is configured and the student has a Microsoft
 *      identity. This lands in the Teams Activity feed (the bell), NOT in a 1:1
 *      chat, so templated reminders never clutter a real conversation.
 *   2. Always an in-app notification (the persistent record + the Nexus bell).
 *      Written LAST and unconditionally: a Graph failure must never cost a
 *      student the durable record.
 *   3. An email backstop, ONLY when NEITHER Teams tier landed, so a
 *      Teams-reachable student is never double-messaged.
 *
 * And once per batch, not per recipient:
 *   4. One combined post to the classroom's Teams channel and group chat, when
 *      the caller passes `group`. The class hears it once, naming the people it
 *      is about, rather than the teacher repeating themselves.
 *
 * THE STANDING CONVENTION: a student-facing message goes to Teams (chat and/or
 * activity feed), the Nexus bell, and where it concerns a group, one combined
 * group post. Every one of those goes through THIS function. A feature that
 * reaches students another way is a bug, not a shortcut.
 *
 * Never throws. A recipient we could not reach comes back with ok: false and
 * channel 'failed', because a partial send must still report honestly rather
 * than fail the whole batch. Each tier that was tried and did not land says WHY
 * in `reasons`: on 11 Sept a class send reached no Teams chat, no Teams alert
 * and no email for 23 students, and nothing anywhere said why.
 *
 * THIS IS ALSO THE DORMANT CHOKE POINT. Every student-facing automated message
 * in Nexus routes through here (prework-sweep, catchup-pace, assignment nudges,
 * catch-up nudges, study-material nudges), and several of those callers pass
 * client-supplied or escalation-derived id lists rather than a roster query. So
 * filtering dormant students at each roster query would leak; filtering here
 * cannot. See filterTrackedStudentIds. A caller who hand-picked the recipients
 * (a teacher selecting five students on a screen) passes respectDormancy: false,
 * because "do not chase somebody who paused" is not the same rule as "a teacher
 * may not write to them". That override is surfaced in the UI, never silent.
 */

import { getSupabaseAdminClient, sendEmail, filterTrackedStudentIds } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';
import { sendTeamsChatMessage } from './teams-messaging';
import { postGroupMessage, type GroupPostResult } from './teams-group-post';
import type { TeamsMention } from './teams-class-announcements';

export interface NudgeResult {
  studentId: string;
  name: string | null;
  /** A real 1:1 Teams chat message. Only attempted when the caller asked for one. */
  chat: boolean;
  teams: boolean;
  inapp: boolean;
  email: boolean;
  ok: boolean;
  /** e.g. 'teams+inapp', 'inapp+email', 'failed', or 'dormant'. */
  channel: string;
  /** Why a tier that was tried did not land, in words a teacher can act on. */
  reasons?: { chat?: string; teams?: string; email?: string };
}

export interface NudgeCounts {
  total: number;
  chat: number;
  teams: number;
  inapp: number;
  email: number;
  /** Everyone not reached, the deliberately skipped included. Kept for the callers that read it. */
  failed: number;
  /** Deliberately not tried, because they are marked dormant. */
  skipped: number;
  /** Tried, and reached on no channel at all. */
  unreached: number;
  /** Present only when a group post was asked for. One per batch, not per student. */
  group?: GroupPostResult;
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

  /**
   * Send a real Teams 1:1 chat message as well, from the signed-in teacher.
   *
   * Opt-in, and it needs THEIR delegated bearer: app-only credentials cannot
   * post a chatMessage at all. Right for a message a person composed to students
   * they picked, wrong for anything a cron sends. See teams-messaging.ts.
   */
  chat?: {
    delegatedToken: string;
    html: string;
    /** Cards posted with the message, referenced from `html` by <attachment id="...">. */
    attachments?: import('./teams-messaging').TeamsChatAttachment[];
    /** Sent once instead when Graph refuses the message with its attachments. */
    fallbackHtml?: string;
  };

  /**
   * One combined post to the classroom's Teams channel and group chat, naming
   * the recipients. Fired once for the batch, after everyone has been messaged.
   */
  group?: { delegatedToken: string; classroomId: string; html: string; peopleLabel?: string };

  /**
   * Per-recipient placeholder values, keyed by student id, e.g.
   * `{ 'uuid': { name: 'Asha', score: '42%' } }`. Substituted into the subject,
   * the body, the html and the chat message as {name} and {score}.
   */
  personalise?: Record<string, Record<string, string>>;

  /**
   * Whether to drop dormant students. Defaults to true, which preserves every
   * caller that existed before this flag. Pass false only when a person picked
   * the recipients by hand and can see who they picked.
   */
  respectDormancy?: boolean;
}

/** How many chats are opened at once. Graph throttles chat creation per user. */
const CHAT_CONCURRENCY = 5;

/**
 * Substitute {name}-style placeholders in a message.
 *
 * Per-recipient values only. Anything constant across the batch (the test's
 * name, the pass mark, the due date) is cheaper for the caller to substitute
 * once before calling. A placeholder with no value is left exactly as written
 * rather than blanked, so a typo reaches the screen as a visible {nmae} instead
 * of a hole in a sentence that nobody notices.
 */
export function applyTokens(text: string, tokens?: Record<string, string>): string {
  if (!tokens || !text) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : whole,
  );
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

/**
 * The same shell with a button under it.
 *
 * plainToHtml escapes everything it is given, which is correct and is also why
 * a URL pasted into the text arrives as inert characters. A reminder whose whole
 * purpose is to get somebody to open a page has to give them something to press,
 * so the link is passed separately and rendered as an anchor.
 *
 * The bare address is repeated in small type beneath, because a mail client that
 * strips the styled anchor still leaves something a student can copy.
 */
export function plainToHtmlWithLink(text: string, url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  return (
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">` +
    `${escapeHtml(text).replace(/\n/g, '<br/>')}` +
    `<p style="margin:20px 0"><a href="${safeUrl}" ` +
    `style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;` +
    `padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>` +
    `<p style="font-size:12px;color:#666">Or paste this into your browser: ${safeUrl}</p>` +
    `</div>`
  );
}

export async function sendNudge(
  input: SendNudgeInput,
): Promise<{ results: NudgeResult[]; counts: NudgeCounts }> {
  const { studentIds: requestedIds, subject, plain, eventType } = input;
  const html = input.html || plainToHtml(plain);
  const teamsText = input.teamsText || subject;
  const metadata = input.metadata || {};

  const supabase = getSupabaseAdminClient() as any;
  // When unset, the Teams tier is skipped and delivery is in-app + email. This
  // lets every nudge feature work before the one-time Teams admin setup is done.
  // Trimmed: a value added with `echo ... | vercel env add` on Windows carries a
  // trailing newline, and an app id with a newline in it matches no app.
  const catalogAppId = (process.env.TEAMS_APP_CATALOG_ID || '').trim() || null;

  // Drop dormant students. A dormant student keeps their access and their class
  // invites, but chasing them about work they have paused is exactly the noise
  // marking them dormant is meant to stop.
  //
  // Non-student ids pass through untouched, which is load-bearing rather than
  // incidental: api/timetable/prework-escalations sends PARENT ids through this
  // function and says so in a comment. An inner-join style filter here would
  // silently kill every parent escalation.
  const respectDormancy = input.respectDormancy !== false;
  const { kept: studentIds, dropped } = respectDormancy
    ? await filterTrackedStudentIds(requestedIds)
    : { kept: requestedIds, dropped: [] as string[] };

  if (dropped.length) {
    console.info(
      `${eventType}: skipped ${dropped.length} dormant recipient(s) of ${requestedIds.length}`,
    );
  }

  // Everyone asked about, the skipped included, so a skipped student is reported
  // by name rather than as an anonymous id.
  const [{ data: users }, { data: profiles }] = requestedIds.length
    ? await Promise.all([
        supabase.from('users').select('id, name, email, ms_oid').in('id', requestedIds),
        supabase.from('student_profiles').select('user_id, ms_teams_email').in('user_id', requestedIds),
      ])
    : [{ data: [] }, { data: [] }];
  const usersBy = new Map<
    string,
    { id: string; name: string | null; email: string | null; ms_oid: string | null }
  >((users || []).map((u: any) => [u.id, u]));
  const teamsBy = new Map<string, string | null>(
    (profiles || []).map((p: any) => [p.user_id, p.ms_teams_email]),
  );

  if (!studentIds.length) {
    // Still report on everyone the caller asked about, so a queue that emptied
    // because everybody is dormant does not look like a silent success.
    const skipped = dormantResults(dropped, usersBy);
    return { results: skipped, counts: tally(skipped) };
  }

  // 0) The real 1:1 chats, when a person asked for them. Run ahead of the rest
  //    and a few at a time: Graph throttles chat creation, and forty in parallel
  //    is how a class send turns into forty 429s. A 401 or 403 is the teacher's
  //    permission, which is the same for every student, so the first one stops
  //    the tier and everyone after carries the same reason instead of forty
  //    identical refusals.
  const chatBy = new Map<string, { ok: boolean; reason?: string }>();
  if (input.chat) {
    const chatInput = input.chat;
    let refusal: string | null = null;
    for (let i = 0; i < studentIds.length; i += CHAT_CONCURRENCY) {
      const batch = studentIds.slice(i, i + CHAT_CONCURRENCY);
      await Promise.all(
        batch.map(async (sid) => {
          const u = usersBy.get(sid);
          if (!u) return;
          if (refusal) {
            chatBy.set(sid, { ok: false, reason: refusal });
            return;
          }
          // The object id first: the Graph member bind takes it directly, and a
          // student whose only stored address is on another domain has no UPN
          // that works. ms_teams_email is the UPN we store; the account email is
          // the last resort.
          const recipient = u.ms_oid || teamsBy.get(sid) || u.email || null;
          if (!recipient) {
            chatBy.set(sid, { ok: false, reason: 'No Microsoft account on file' });
            return;
          }
          const r = await sendTeamsChatMessage(
            chatInput.delegatedToken,
            recipient,
            applyTokens(chatInput.html, input.personalise?.[sid]),
            {
              attachments: chatInput.attachments,
              fallbackHtml: chatInput.fallbackHtml
                ? applyTokens(chatInput.fallbackHtml, input.personalise?.[sid])
                : undefined,
            },
          );
          if (!r.ok && (r.status === 401 || r.status === 403) && !refusal) {
            refusal = r.reason || `Microsoft refused the chat (${r.status})`;
          }
          chatBy.set(sid, r.ok ? { ok: true } : { ok: false, reason: r.reason });
        }),
      );
    }
  }

  // Process recipients in parallel to stay within the serverless time budget.
  const results = await Promise.all(
    studentIds.map(async (sid): Promise<NudgeResult> => {
      const u = usersBy.get(sid);
      if (!u) {
        return {
          studentId: sid,
          name: null,
          chat: false,
          teams: false,
          inapp: false,
          email: false,
          ok: false,
          channel: 'none',
        };
      }

      // Everything this recipient is told, with their own values filled in.
      // Resolved once, so the chat message, the ping, the bell row and the email
      // cannot end up saying four slightly different things.
      const tokens = input.personalise?.[sid];
      const subjectFor = applyTokens(subject, tokens);
      const plainFor = applyTokens(plain, tokens);
      const htmlFor = applyTokens(html, tokens);
      const teamsTextFor = applyTokens(teamsText, tokens);
      const reasons: NonNullable<NudgeResult['reasons']> = {};

      const chatResult = chatBy.get(sid);
      const chat = chatResult?.ok === true;
      if (input.chat && !chat) reasons.chat = chatResult?.reason || 'Teams chat did not send';

      // 1) Teams Activity-feed ping. ms_oid is preferred; the UPN
      //    (ms_teams_email) is a fallback identifier when the oid is missing.
      let teams = false;
      const teamsUserId = u.ms_oid || teamsBy.get(sid) || null;
      if (!teamsUserId) {
        reasons.teams = 'No Microsoft account on file';
      } else if (!catalogAppId) {
        reasons.teams = 'Teams alerts are not set up on this server';
      } else {
        const r = await sendTeamsActivityNotification(teamsUserId, {
          text: teamsTextFor,
          preview: plainFor,
          catalogAppId,
        });
        teams = r.ok;
        // Never swallow a Teams failure: without this, a student who got only
        // the in-app row gives no clue why Teams did not land.
        if (!r.ok) {
          console.error(`${eventType} teams send failed for ${sid}:`, r.reason);
          reasons.teams = `Teams alert did not send (${String(r.reason || r.status).slice(0, 180)})`;
        }
      }

      // 2) Always record the in-app notification (persistent record + bell).
      let inapp = false;
      try {
        const { error } = await supabase.from('user_notifications').insert({
          user_id: sid,
          event_type: eventType,
          title: subjectFor,
          message: plainFor,
          metadata,
          is_read: false,
        });
        if (error) console.error(`${eventType} notification insert failed:`, error.message);
        else inapp = true;
      } catch (e) {
        console.error(`${eventType} notification insert threw:`, e);
      }

      // 3) Email backstop, only when NEITHER Teams tier landed. A student who
      //    got the chat message and the email would read the same words twice
      //    from the same teacher, which reads as a mistake rather than as care.
      let email = false;
      if (!teams && !chat) {
        if (!u.email) {
          reasons.email = 'No email on file';
        } else {
          const r = await sendEmail({ to: u.email, subject: subjectFor, html: htmlFor }).catch(
            (e: unknown) => ({ success: false, error: e instanceof Error ? e.message : undefined }),
          );
          email = !!r.success;
          if (!email) reasons.email = `Email did not send (${(r as { error?: string }).error || 'unknown'})`;
        }
      }

      const parts = [
        chat ? 'chat' : '',
        teams ? 'teams' : '',
        inapp ? 'inapp' : '',
        email ? 'email' : '',
      ].filter(Boolean);
      return {
        studentId: sid,
        name: u.name,
        chat,
        teams,
        inapp,
        email,
        ok: parts.length > 0,
        channel: parts.length ? parts.join('+') : 'failed',
        ...(Object.keys(reasons).length ? { reasons } : {}),
      };
    }),
  );

  // Dormant recipients are reported alongside the real ones with their own
  // channel, so a caller counting failures can tell "we could not reach them"
  // apart from "we deliberately did not try".
  const allResults = [...results, ...dormantResults(dropped, usersBy)];

  // 4) The group post, once, after everybody has been reached individually.
  //    Built from the people actually messaged rather than from the list the
  //    caller passed in, so the names read out in the class channel cannot claim
  //    somebody was told who was skipped as dormant or has no account.
  let group: GroupPostResult | undefined;
  if (input.group) {
    const people: TeamsMention[] = studentIds
      .map((sid) => usersBy.get(sid))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => ({ oid: u.ms_oid || '', displayName: u.name || 'Student' }));
    group = await postGroupMessage({
      token: input.group.delegatedToken,
      supabase,
      classroomId: input.group.classroomId,
      html: input.group.html,
      people,
      peopleLabel: input.group.peopleLabel,
    });
    if (group.errors.length) {
      console.error(eventType + ' group post problems: ' + group.errors.join('; '));
    }
  }

  return {
    results: allResults,
    counts: { ...tally(allResults), ...(group ? { group } : {}) },
  };
}

/** The per-channel counts, with deliberate skips kept apart from real failures. */
function tally(results: NudgeResult[]): NudgeCounts {
  const failed = results.filter((r) => !r.ok).length;
  const skipped = results.filter((r) => r.channel === 'dormant').length;
  return {
    total: results.length,
    chat: results.filter((r) => r.chat).length,
    teams: results.filter((r) => r.teams).length,
    inapp: results.filter((r) => r.inapp).length,
    email: results.filter((r) => r.email).length,
    failed,
    skipped,
    unreached: failed - skipped,
  };
}

/** Placeholder results for recipients we deliberately skipped, named where we can. */
function dormantResults(
  studentIds: string[],
  usersBy: Map<string, { name: string | null }>,
): NudgeResult[] {
  return studentIds.map((studentId) => ({
    studentId,
    name: usersBy.get(studentId)?.name ?? null,
    chat: false,
    teams: false,
    inapp: false,
    email: false,
    ok: false,
    channel: 'dormant',
  }));
}

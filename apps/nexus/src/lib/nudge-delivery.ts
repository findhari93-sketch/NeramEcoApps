/**
 * The one door for every message to a student (and the teacher digests).
 *
 * Extracted from /api/assignments/nudge so the photo-review queue and the
 * inactivity watchlist reach students through exactly the same channels, with
 * the same failure behaviour, instead of each route reinventing it (or worse,
 * one route HTTP-calling another).
 *
 * Delivery per recipient (founder decisions 2026-09-10, 2026-09-13, 2026-09-14):
 *   0. A Teams 1:1 chat, from a teacher. Either the signed-in teacher, when the
 *      caller passes `chat` with their delegated token (they pressed Send), or,
 *      for an automatic message, the teacher who connected their Teams once,
 *      when the caller passes `sendAs` (lib/teams-sender.ts). Both post through
 *      sendTeamsChatMessage: an automatic reminder is the same chat, from the same
 *      person, that a manual message is.
 *   1. A Microsoft Teams Activity-feed ping ("Neram Assistant"), ONLY when no
 *      chat landed. Chat first: a chat already raises a Teams alert, and two
 *      alerts for one message is how students learn to mute the app.
 *   2. Always an in-app notification (the persistent record + the Nexus bell).
 *      Written LAST and unconditionally: a Graph failure must never cost a
 *      student the durable record.
 *   There is no email channel (founder, 2026-09-14): students live in Teams.
 *
 * {name} and {firstName} are filled for every recipient automatically; a
 * caller's own `personalise` values win. Every send writes one receipt row per
 * recipient (nexus_notification_deliveries), so "who got what, and why not" is
 * answerable after the fact.
 *
 * And once per batch, not per recipient:
 *   3. One combined post to the classroom's Teams channel and group chat, when
 *      the caller passes `group`. The class hears it once, naming the people it
 *      is about, rather than the teacher repeating themselves. Never for a
 *      message about somebody failing to do something.
 *
 * THE STANDING CONVENTION: a student-facing message goes to a Teams chat (or the
 * activity feed), the Nexus bell, and where it concerns a group, one combined
 * group post. Every one of those goes through THIS function. A feature that
 * reaches students another way is a bug, not a shortcut.
 *
 * Never throws. A recipient we could not reach comes back with ok: false and
 * channel 'failed', because a partial send must still report honestly rather
 * than fail the whole batch. Each tier that was tried and did not land says WHY
 * in `reasons`: on 11 Sept a class send reached no Teams chat and no Teams alert
 * for 23 students, and nothing anywhere said why.
 *
 * THIS IS ALSO THE DORMANT CHOKE POINT. Every student-facing automated message
 * in Nexus routes through here, and several callers pass client-supplied or
 * escalation-derived id lists rather than a roster query. So filtering dormant
 * students at each roster query would leak; filtering here cannot. See
 * filterTrackedStudentIds. A caller who hand-picked the recipients (a teacher
 * selecting five students on a screen) passes respectDormancy: false, because
 * "do not chase somebody who paused" is not the same rule as "a teacher may not
 * write to them". That override is surfaced in the UI, never silent.
 */

import { getSupabaseAdminClient, filterTrackedStudentIds } from '@neram/database';
import { sendTeamsActivityNotification } from '@neram/auth';
import { sendTeamsChatMessage } from './teams-messaging';
import { postGroupMessage, type GroupPostResult } from './teams-group-post';
import type { TeamsMention } from './teams-class-announcements';
import { getSenderAccessToken, touchSender } from './teams-sender';

export interface NudgeResult {
  studentId: string;
  name: string | null;
  /** A Teams 1:1 chat from a teacher (pressed Send, or connected for automatic sends). */
  chat: boolean;
  teams: boolean;
  inapp: boolean;
  ok: boolean;
  /** e.g. 'chat+inapp', 'teams+inapp', 'inapp', 'failed', or 'dormant'. */
  channel: string;
  /** Why a tier that was tried did not land, in words a teacher can act on. */
  reasons?: { chat?: string; teams?: string };
}

export interface NudgeCounts {
  total: number;
  chat: number;
  teams: number;
  inapp: number;
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
  /** In-app notification title. */
  subject: string;
  /** Plain-text body: the in-app message and the Teams preview line. */
  plain: string;
  /** HTML for an automatic chat (`sendAs`). Falls back to the subject and plain text. */
  html?: string;
  /** Short headline for the Teams activity feed. Falls back to `subject`. */
  teamsText?: string;
  /** notification_event_type value. Must already exist in the DB enum. */
  eventType: string;
  /** Extra JSONB stored on the notification row, e.g. { source: 'watchlist' }. */
  metadata?: Record<string, unknown>;

  /**
   * A Teams 1:1 chat from the signed-in teacher, who pressed Send. Needs THEIR
   * delegated bearer: app-only credentials cannot post a chat message at all.
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
   * A Teams 1:1 chat sent as a teacher who connected their Teams once
   * (lib/teams-sender.ts). For an AUTOMATIC message, the classroom's connected
   * teacher. For a pressed Send, pass the caller's own id alongside `chat`: it is
   * used only if their browser token was refused (no chat permission). If the
   * connection is not working, each receipt says why and the feed and bell still run.
   */
  sendAs?: { senderUserId: string; html?: string; link?: { url: string; label: string } };

  /**
   * The teacher who pressed Send on a screen. Shorthand for both of the above:
   * their browser token as `chat` (when it is a real Microsoft token), and their
   * own connected login as `sendAs` in case that token cannot send chats. The
   * chat body is `html`, else the subject and plain text. Explicit `chat` or
   * `sendAs` win.
   */
  teacher?: { authHeader: string | null; userId: string };

  /** The Nexus bell only: no Teams chat, no activity feed. For a caller that offers "do not ping". */
  bellOnly?: boolean;

  /**
   * One combined post to the classroom's Teams channel and group chat, naming
   * the recipients. Fired once for the batch, after everyone has been messaged.
   */
  group?: { delegatedToken: string; classroomId: string; html: string; peopleLabel?: string };

  /**
   * Per-recipient placeholder values, keyed by student id, e.g.
   * `{ 'uuid': { score: '42%' } }`. Substituted into the subject, the body and the
   * chat message. {name} and {firstName} are always available without this.
   */
  personalise?: Record<string, Record<string, string>>;

  /**
   * Whether to drop dormant students. Defaults to true, which preserves every
   * caller that existed before this flag. Pass false only when a person picked
   * the recipients by hand and can see who they picked.
   */
  respectDormancy?: boolean;

  /** 'staff' for messages to teachers (digests): no dormant filter. Defaults to 'student'. */
  audience?: 'student' | 'staff';

  /** What sent this, for the receipts: e.g. { kind: 'sketchbook_reminder', refId: classroomId }. */
  source?: { kind: string; refId?: string };
}

/** "Asha" from "Asha Bavi"; "there" when no name is on file, so "Hi {firstName}" still reads. */
export function firstNameOf(name: string | null | undefined): string {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first || 'there';
}

/** How many chats are opened at once. Graph throttles chat creation per user. */
const CHAT_CONCURRENCY = 5;

/**
 * Substitute {name}-style placeholders in a message.
 *
 * A placeholder with no value is left exactly as written rather than blanked, so
 * a typo reaches the screen as a visible {nmae} instead of a hole in a sentence
 * that nobody notices.
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

/** Plain text as simple HTML, line breaks kept. Teams strips inline styles anyway. */
export function plainToHtml(text: string): string {
  return `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
}

/**
 * The same with a link under it. plainToHtml escapes everything it is given, so a
 * URL pasted into the text arrives as inert characters; a reminder whose purpose
 * is to get somebody to open a page needs something to press.
 */
export function plainToHtmlWithLink(text: string, url: string, label: string): string {
  return `${plainToHtml(text)}<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;
}

/**
 * The `chat` input for a message a teacher just sent from a screen: their own
 * Teams chat, when the request carries a real Microsoft token. Nexus's own test,
 * impersonation and parent tokens cannot post to Teams, so those get undefined
 * and the message still reaches the activity feed and the bell.
 *
 * The browser must send getTeacherToken() (it carries ChatMessage.Send), not
 * getToken(); a token without chat scopes comes back with a 403 reason on the receipt.
 */
export function teacherChatFrom(authHeader: string | null, html: string): SendNudgeInput['chat'] {
  const token = /^Bearer\s+(.+)$/i.exec(authHeader || '')?.[1]?.trim() || '';
  if (!token || /^(test_|imp_|par_)/.test(token)) return undefined;
  return { delegatedToken: token, html };
}

/** The chat an automatic message sends when the caller gave no html: headline, body, link. */
export function automaticChatHtml(subject: string, plain: string, link?: { url: string; label: string }): string {
  const body = `<p><strong>${escapeHtml(subject)}</strong></p>${plainToHtml(plain)}`;
  return link ? `${body}<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>` : body;
}

export async function sendNudge(
  rawInput: SendNudgeInput,
): Promise<{ results: NudgeResult[]; counts: NudgeCounts }> {
  const withTeacher: SendNudgeInput = rawInput.teacher
    ? {
        ...rawInput,
        chat:
          rawInput.chat ??
          teacherChatFrom(rawInput.teacher.authHeader, rawInput.html || automaticChatHtml(rawInput.subject, rawInput.plain)),
        sendAs: rawInput.sendAs ?? { senderUserId: rawInput.teacher.userId },
      }
    : rawInput;
  const input: SendNudgeInput = rawInput.bellOnly
    ? { ...withTeacher, chat: undefined, sendAs: undefined, group: undefined }
    : withTeacher;
  const { studentIds: requestedIds, subject, plain, eventType } = input;
  const teamsText = input.teamsText || subject;
  const metadata = input.metadata || {};

  const supabase = getSupabaseAdminClient() as any;
  // When unset, the activity-feed tier is skipped. Trimmed: a value added with
  // `echo ... | vercel env add` on Windows carries a trailing newline, and an app
  // id with a newline in it matches no app.
  const catalogAppId = (process.env.TEAMS_APP_CATALOG_ID || '').trim() || null;

  // Drop dormant students. Non-student ids pass through untouched, which is
  // load-bearing: api/timetable/prework-escalations sends PARENT ids through
  // this function. An inner-join style filter here would silently kill every
  // parent escalation. Staff are never "dormant students".
  const staff = input.audience === 'staff';
  const respectDormancy = !staff && input.respectDormancy !== false;
  const { kept: studentIds, dropped } = respectDormancy
    ? await filterTrackedStudentIds(requestedIds)
    : { kept: requestedIds, dropped: [] as string[] };

  if (dropped.length) {
    console.info(`${eventType}: skipped ${dropped.length} dormant recipient(s) of ${requestedIds.length}`);
  }

  // Everyone asked about, the skipped included, so a skipped student is reported
  // by name rather than as an anonymous id.
  const [{ data: users }, { data: profiles }] = requestedIds.length
    ? await Promise.all([
        supabase.from('users').select('id, name, email, ms_oid').in('id', requestedIds),
        supabase.from('student_profiles').select('user_id, ms_teams_email').in('user_id', requestedIds),
      ])
    : [{ data: [] }, { data: [] }];
  const usersBy = new Map<string, { id: string; name: string | null; email: string | null; ms_oid: string | null }>(
    (users || []).map((u: any) => [u.id, u]),
  );
  const teamsBy = new Map<string, string | null>((profiles || []).map((p: any) => [p.user_id, p.ms_teams_email]));

  // Every recipient's own values: their name, always, then whatever the caller set.
  const tokensFor = (sid: string): Record<string, string> => {
    const name = usersBy.get(sid)?.name;
    return { name: (name || '').trim() || 'there', firstName: firstNameOf(name), ...(input.personalise?.[sid] || {}) };
  };

  if (!studentIds.length) {
    // Still report on everyone the caller asked about, so a queue that emptied
    // because everybody is dormant does not look like a silent success.
    const skipped = dormantResults(dropped, usersBy);
    await writeReceipts(supabase, input, skipped);
    return { results: skipped, counts: tally(skipped) };
  }

  // 0) The chats. A person's own token when they pressed Send; otherwise, or when
  //    that token cannot send chats, the connected teacher's login (`sendAs`).
  const chatBy = new Map<string, { ok: boolean; reason?: string }>();
  const chatWanted = Boolean(input.chat || input.sendAs);

  /**
   * Send one chat to each id with this token. Graph throttles chat creation, and
   * forty in parallel is how a class send turns into forty 429s. A 401 or 403 is
   * the sender's permission, the same for every student, so the first one stops
   * the pass and everyone after carries the same reason. Returns that refusal.
   */
  const runChats = async (ids: string[], chatInput: NonNullable<SendNudgeInput['chat']>): Promise<string | null> => {
    const { delegatedToken, html: chatHtml, attachments, fallbackHtml } = chatInput;
    let refusal: string | null = null;
    for (let i = 0; i < ids.length; i += CHAT_CONCURRENCY) {
      const batch = ids.slice(i, i + CHAT_CONCURRENCY);
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
          const tokens = tokensFor(sid);
          const r = await sendTeamsChatMessage(delegatedToken, recipient, applyTokens(chatHtml, tokens), {
            attachments,
            fallbackHtml: fallbackHtml ? applyTokens(fallbackHtml, tokens) : undefined,
          });
          if (!r.ok && (r.status === 401 || r.status === 403) && !refusal) {
            refusal = r.reason || `Microsoft refused the chat (${r.status})`;
          }
          chatBy.set(sid, r.ok ? { ok: true } : { ok: false, reason: r.reason });
        }),
      );
    }
    return refusal;
  };

  let ownRefusal: string | null = null;
  if (input.chat) ownRefusal = await runChats(studentIds, input.chat);

  // The connected login: for an automatic message, or to rescue a pressed Send
  // whose browser token had no chat permission.
  if (input.sendAs && (!input.chat || ownRefusal)) {
    const pending = studentIds.filter((sid) => chatBy.get(sid)?.ok !== true && usersBy.has(sid));
    try {
      const token = await getSenderAccessToken(input.sendAs.senderUserId);
      const html = input.chat?.html || input.sendAs.html || input.html || automaticChatHtml(subject, plain, input.sendAs.link);
      await runChats(pending, { delegatedToken: token, html });
      if (pending.some((sid) => chatBy.get(sid)?.ok)) {
        await touchSender(input.sendAs.senderUserId, supabase).catch(() => undefined);
      }
    } catch (err) {
      const reason = `Automatic Teams chat not sent: ${err instanceof Error ? err.message : 'the Teams connection failed'}`;
      for (const sid of pending) chatBy.set(sid, { ok: false, reason: ownRefusal ? `${ownRefusal}. ${reason}` : reason });
    }
  }

  // Process recipients in parallel to stay within the serverless time budget.
  const results = await Promise.all(
    studentIds.map(async (sid): Promise<NudgeResult> => {
      const u = usersBy.get(sid);
      if (!u) {
        return { studentId: sid, name: null, chat: false, teams: false, inapp: false, ok: false, channel: 'none' };
      }

      // Everything this recipient is told, with their own values filled in.
      const tokens = tokensFor(sid);
      const subjectFor = applyTokens(subject, tokens);
      const plainFor = applyTokens(plain, tokens);
      const teamsTextFor = applyTokens(teamsText, tokens);
      const reasons: NonNullable<NudgeResult['reasons']> = {};

      const chatResult = chatBy.get(sid);
      const chat = chatResult?.ok === true;
      if (chatWanted && !chat) reasons.chat = chatResult?.reason || 'Teams chat did not send';

      // 1) Teams Activity-feed ping, only when no chat landed (chat first).
      let teams = false;
      const teamsUserId = u.ms_oid || teamsBy.get(sid) || null;
      if (chat || input.bellOnly) {
        // The chat already raised a Teams alert; a second one for the same message is noise.
      } else if (!teamsUserId) {
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

      const parts = [chat ? 'chat' : '', teams ? 'teams' : '', inapp ? 'inapp' : ''].filter(Boolean);
      return {
        studentId: sid,
        name: u.name,
        chat,
        teams,
        inapp,
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

  // 3) The group post, once, after everybody has been reached individually.
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

  await writeReceipts(supabase, input, allResults);

  return {
    results: allResults,
    counts: { ...tally(allResults), ...(group ? { group } : {}) },
  };
}

/**
 * One person, one notice, in the shape the old createUserNotification took, so
 * code that used to write the bell directly moves to the one door by a rename.
 * For a reply to something the person did themselves (their issue changed, their
 * enrolment changed), so the dormant filter is off. Never throws.
 */
export async function notifyUser(
  n: { user_id: string; event_type: string; title: string; message: string; metadata?: Record<string, unknown> | null },
  opts: { teacher?: SendNudgeInput['teacher']; audience?: SendNudgeInput['audience'] } = {},
): Promise<NudgeResult | null> {
  try {
    const { results } = await sendNudge({
      studentIds: [n.user_id],
      respectDormancy: false,
      subject: n.title,
      plain: n.message,
      eventType: n.event_type,
      metadata: n.metadata || undefined,
      ...(opts.teacher ? { teacher: opts.teacher } : {}),
      ...(opts.audience ? { audience: opts.audience } : {}),
      source: { kind: n.event_type },
    });
    return results[0] ?? null;
  } catch (err) {
    console.error(`${n.event_type} notifyUser failed:`, err);
    return null;
  }
}

/**
 * One receipt per recipient. Best effort: a missing table or a failed insert is
 * logged and never costs the send that already happened.
 */
async function writeReceipts(supabase: any, input: SendNudgeInput, results: NudgeResult[]): Promise<void> {
  if (!results.length) return;
  try {
    const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const { error } = await supabase.from('nexus_notification_deliveries').insert(
      results.map((r) => ({
        batch_id: batchId,
        event_type: input.eventType,
        source: input.source?.kind ?? null,
        ref_id: input.source?.refId ?? null,
        recipient_id: r.studentId,
        chat: r.chat,
        teams: r.teams,
        inapp: r.inapp,
        channel: r.channel,
        reasons: r.reasons ?? null,
      })),
    );
    if (error) console.error(`${input.eventType} receipts not written:`, error.message);
  } catch (e) {
    console.error(`${input.eventType} receipts threw:`, e);
  }
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
    failed,
    skipped,
    unreached: failed - skipped,
  };
}

/** Placeholder results for recipients we deliberately skipped, named where we can. */
function dormantResults(studentIds: string[], usersBy: Map<string, { name: string | null }>): NudgeResult[] {
  return studentIds.map((studentId) => ({
    studentId,
    name: usersBy.get(studentId)?.name ?? null,
    chat: false,
    teams: false,
    inapp: false,
    ok: false,
    channel: 'dormant',
  }));
}

/**
 * The one door for every message to a student (and the teacher digests).
 *
 * Extracted from /api/assignments/nudge so the photo-review queue and the
 * inactivity watchlist reach students through exactly the same channels, with
 * the same failure behaviour, instead of each route reinventing it (or worse,
 * one route HTTP-calling another).
 *
 * Delivery per recipient (founder decisions 2026-09-10, 2026-09-13, 2026-09-14):
 *   0. A Teams 1:1 chat from Neram Assistant (lib/teams-assistant.ts), and from
 *      nobody else. Founder, 2026-09-24: a teacher's own Teams is never used to
 *      send anything. With 200 students, every reaction and reminder opened
 *      another thread in the teacher's chat list and buried the real
 *      conversations. When a person did something for the student (the caller
 *      passes `teacher`, `chat`, `sendAs` or `from`), the Assistant's card says
 *      "From Hari" and carries a "Message Hari" button, so a student who wants
 *      to answer can start that chat themselves.
 *      lib/sender-classification.test.ts holds this line.
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
import { postGroupMessage, type GroupPostResult } from './teams-group-post';
import type { TeamsMention } from './teams-class-announcements';
import { assistantEnabled, sendAssistantMessage, type AssistantFrom } from './teams-assistant';

export interface NudgeResult {
  studentId: string;
  name: string | null;
  /** A Teams 1:1 chat from Neram Assistant landed. */
  chat: boolean;
  /** Who it came from, when a chat landed. Always the Assistant now; kept for the receipts. */
  chatSender?: 'assistant';
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
  /**
   * The message as HTML. Only its first link is used now: it becomes the button
   * on the Assistant's card when the caller gave no other link.
   */
  html?: string;
  /** Short headline for the Teams activity feed. Falls back to `subject`. */
  teamsText?: string;
  /** notification_event_type value. Must already exist in the DB enum. */
  eventType: string;
  /** Extra JSONB stored on the notification row, e.g. { source: 'watchlist' }. */
  metadata?: Record<string, unknown>;

  /**
   * The signed-in teacher pressed Send. Their token names WHO it is from (the
   * `oid` claim); the message itself goes out as Neram Assistant. An Adaptive
   * Card in `attachments` is kept as the Assistant's card.
   */
  chat?: {
    delegatedToken: string;
    html: string;
    /** Cards posted with the message, referenced from `html` by <attachment id="...">. */
    attachments?: import('./teams-messaging').TeamsChatAttachment[];
    /** Sent once instead when Graph refuses the message with its attachments. */
    fallbackHtml?: string;
  };

  /** The teacher this is from, by Nexus user id. Sent as Neram Assistant with their name on it. */
  sendAs?: { senderUserId: string; html?: string; link?: { url: string; label: string } };

  /** The teacher who pressed Send on a screen. Sent as Neram Assistant with their name on it. */
  teacher?: { authHeader: string | null; userId: string };

  /** Who a message is from, when the caller has only the id. Same effect as `teacher`. */
  from?: { userId: string };

  /**
   * Options for the Neram Assistant chat, which is the only chat there is.
   *
   * A system message (a result is out, a cron fired) passes this with no `from`.
   * `from` is filled in by sendNudge from `teacher` / `chat` / `sendAs`; callers
   * rarely set it. `card` is a caller's own Adaptive Card JSON. With the
   * Assistant switched off or unreachable, the feed and the bell carry the
   * message: there is no fallback to a person's Teams.
   */
  assistant?: {
    link?: { url: string; label: string };
    from?: AssistantFromRef | null;
    card?: string | null;
  };

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

  /**
   * Let Not started students (never entered Nexus, dormant_source 'auto') through
   * the dormant filter. Only for messages whose purpose is getting them in: the
   * join reminders and the Photo Review "add your photo" remind. Students paused
   * by staff are still dropped.
   */
  reachNotStarted?: boolean;

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

/** Who a message is from, before it is looked up: a Nexus user id, or a Microsoft object id from a token. */
export type AssistantFromRef = { userId?: string | null; msOid?: string | null };

/** The `oid` claim of a Microsoft token, read without verifying it: only used to put a name on a card. */
export function oidFromToken(token: string | null | undefined): string | null {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json?.oid === 'string' && json.oid ? json.oid : null;
  } catch {
    return null;
  }
}

/** The first link in a piece of chat HTML, entities decoded, or undefined. */
export function linkFromHtml(html: string | null | undefined): { url: string; label: string } | undefined {
  const m = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(String(html || ''));
  if (!m) return undefined;
  const decode = (t: string) =>
    t.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  const url = decode(m[1]);
  return /^https?:\/\//i.test(url) ? { url, label: decode(m[2]) || 'Open' } : undefined;
}

/** A caller's Adaptive Card JSON as an object, or null when it does not parse. */
function parseCardContent(json: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * What a caller that named a person meant: who it is from, the page button, and
 * any card they built. Null for a system message.
 */
function assistantFromPerson(
  input: SendNudgeInput,
): { from: AssistantFromRef; link?: { url: string; label: string }; card?: string | null } | null {
  if (!input.chat && !input.sendAs && !input.teacher && !input.from) return null;
  const bearer = /^Bearer\s+(.+)$/i.exec(input.teacher?.authHeader || '')?.[1]?.trim() || null;
  const from: AssistantFromRef = {
    userId: input.from?.userId || input.teacher?.userId || input.sendAs?.senderUserId || null,
    msOid: oidFromToken(input.chat?.delegatedToken) || oidFromToken(bearer),
  };
  const card = input.chat?.attachments?.find((a) => /adaptive/i.test(a.contentType))?.content ?? null;
  const link =
    input.sendAs?.link ||
    linkFromHtml(input.html) ||
    linkFromHtml(input.sendAs?.html) ||
    linkFromHtml(input.chat?.fallbackHtml) ||
    linkFromHtml(input.chat?.html);
  return { from, link, card };
}

/** The teacher's name and sign-in address for the card. Null when nobody is named or found. */
async function resolveAssistantFrom(ref: AssistantFromRef | null | undefined, supabase: any): Promise<AssistantFrom | null> {
  if (!ref?.userId && !ref?.msOid) return null;
  try {
    const q = supabase.from('users').select('name, email');
    const { data } = ref.userId ? await q.eq('id', ref.userId).maybeSingle() : await q.eq('ms_oid', ref.msOid).maybeSingle();
    const name = String(data?.name || '').trim();
    if (!name) return null;
    return { name, email: String(data?.email || '').trim() || null };
  } catch {
    return null;
  }
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
  // Every chat is Neram Assistant (founder, 2026-09-24). A caller that still
  // names a person (`teacher`, `chat`, `sendAs`) is telling us WHO the message
  // is from, not whose Teams to send it through: it becomes the "From" line and
  // the "Message" button on the Assistant's card, and nothing more.
  const person = assistantFromPerson(rawInput);
  const assistantInput: SendNudgeInput['assistant'] = rawInput.assistant
    ? { ...rawInput.assistant, ...(person ? { from: rawInput.assistant.from ?? person.from } : {}) }
    : person
      ? { link: person.link, from: person.from, card: person.card }
      : undefined;
  const unified: SendNudgeInput = {
    ...rawInput,
    chat: undefined,
    sendAs: undefined,
    teacher: undefined,
    from: undefined,
    assistant: assistantInput,
  };
  const input: SendNudgeInput = rawInput.bellOnly
    ? { ...unified, group: undefined, assistant: undefined }
    : unified;
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
    ? await filterTrackedStudentIds(requestedIds, undefined, { reachNotStarted: input.reachNotStarted === true })
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

  // 0) The chat, from Neram Assistant only.
  const chatBy = new Map<string, { ok: boolean; reason?: string; sender?: 'assistant' }>();
  const chatWanted = Boolean(input.assistant);

  /**
   * Neram Assistant.
   *
   * A link, a named teacher or a caller's own card becomes an Adaptive Card
   * carrying the whole message, and the activity text is left empty so the words
   * are not printed twice. With none of those the text carries it, because a
   * card whose only content is a sentence is a worse sentence.
   *
   * Switched off, or not reachable for this student (manifest not approved, app
   * removed): the receipt says why, and the activity feed and the bell carry the
   * message. Never a teacher's own chat (founder, 2026-09-24).
   */
  if (input.assistant) {
    const { link, card: callerCard } = input.assistant;
    const from = await resolveAssistantFrom(input.assistant.from, supabase);
    const allowed = await assistantEnabled(supabase);
    if (!allowed) {
      for (const sid of studentIds) {
        chatBy.set(sid, { ok: false, reason: 'Neram Assistant is switched off' });
      }
    }
    for (let i = 0; allowed && i < studentIds.length; i += CHAT_CONCURRENCY) {
      const batch = studentIds.slice(i, i + CHAT_CONCURRENCY);
      await Promise.all(
        batch.map(async (sid) => {
          const u = usersBy.get(sid);
          if (!u) return;
          const tokens = tokensFor(sid);
          const subjectFor = applyTokens(subject, tokens);
          const plainFor = applyTokens(plain, tokens);
          const content = callerCard ? parseCardContent(applyTokens(callerCard, tokens)) : null;
          const r = await sendAssistantMessage(
            { id: sid, ms_oid: u.ms_oid },
            link || from || content
              ? {
                  text: '',
                  card: {
                    title: subjectFor,
                    body: plainFor,
                    buttonLabel: link?.label,
                    url: link?.url,
                    from,
                    content,
                  },
                }
              : { text: `${subjectFor}

${plainFor}` },
          );
          chatBy.set(sid, r.ok ? { ok: true, sender: 'assistant' } : { ok: false, reason: r.reason });
        }),
      );
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
      if (chatWanted && !chat) {
        reasons.chat =
          chatResult?.reason || 'Neram Assistant did not send';
      }

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

      const parts = [
        chat ? 'assistant' : '',
        teams ? 'teams' : '',
        inapp ? 'inapp' : '',
      ].filter(Boolean);
      return {
        studentId: sid,
        name: u.name,
        chat,
        ...(chat && chatResult?.sender ? { chatSender: chatResult.sender } : {}),
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
  opts: {
    teacher?: SendNudgeInput['teacher'];
    audience?: SendNudgeInput['audience'];
    /**
     * The chat body, when the notice needs a clickable link.
     *
     * Without this, sendNudge's teacher branch falls back to
     * automaticChatHtml(subject, plain), which has NO anchor, and plainToHtml
     * escapes any URL pasted into `message` into inert characters. So a notice
     * sent through this door could not carry a link at all until this option
     * existed. Build it with plainToHtmlWithLink.
     */
    html?: string;
  } = {},
): Promise<NudgeResult | null> {
  try {
    const { results } = await sendNudge({
      studentIds: [n.user_id],
      respectDormancy: false,
      subject: n.title,
      plain: n.message,
      eventType: n.event_type,
      metadata: n.metadata || undefined,
      ...(opts.html ? { html: opts.html } : {}),
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
        bot: r.chatSender === 'assistant',
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

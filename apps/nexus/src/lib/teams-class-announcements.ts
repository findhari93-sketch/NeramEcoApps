/**
 * Teams announcement + calendar-cleanup helpers for a scheduled class.
 *
 * These were previously private to app/api/timetable/route.ts. They live here so
 * the timetable DELETE handler AND the Teams reconcilers (sync-now, cron) can share
 * one implementation for "mark this class cancelled in Teams".
 *
 * A cancellation touches two separate things in Teams:
 *   1. The calendar/online-meeting entry  -> cancelTeamsEvent (Graph DELETE)
 *   2. The "Join Meeting" card in the channel + group chat -> announceCancellationToTeams
 *      (Graph cannot edit a message body in place, so we soft-delete the old card and
 *       post a fresh "Cancelled" one).
 */

import { getAppOnlyToken } from '@/lib/graph-app-token';
import { getSupabaseAdminClient } from '@neram/database';

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

/** Default channel scheduled-meeting announcements are posted to (falls back to General). */
export const MEETING_CHANNEL_NAME = 'Class Meeting Details';

/** The Teams reference columns a cancellation reads off a class row. */
export interface TeamsAnnouncementRefs {
  teams_channel_id: string | null;
  teams_channel_message_id: string | null;
  teams_group_chat_message_id: string | null;
}

/**
 * Escape text going into a card.
 *
 * Every builder here interpolates a teacher-typed title straight into HTML. A
 * class called "Angles < 90 & > 45" produced a card Teams rendered as garbage,
 * silently, because Graph accepts the malformed markup and does its best.
 */
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Card shown in the channel/chat once a class is cancelled. Carries no join link. */
export function buildCancelledHtml(cls: {
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
}): string {
  return `<h3>❌ Cancelled: ${esc(cls.title)}</h3>
<p><strong>Was:</strong> ${cls.scheduled_date}, ${cls.start_time} to ${cls.end_time} (IST)</p>
<p>This class has been cancelled, you do not need to join. We will let you know if it is rescheduled.</p>`;
}

/**
 * Card shown in the channel/chat once a class has been moved.
 *
 * Carries the join link, because the meeting itself is unchanged: the student who
 * reads this card is the same student who will click that link on the new day.
 * The old date is spelled out so a student scrolling back does not have to guess
 * which of two cards is current.
 */
export function buildRescheduledHtml(
  cls: { title: string; scheduled_date: string; start_time: string; end_time: string },
  was: { scheduled_date: string; start_time: string },
  joinUrl?: string | null,
  rsvpUrl?: string | null,
): string {
  return `<h3>🔁 Moved: ${esc(cls.title)}</h3>
<p><strong>Now:</strong> ${cls.scheduled_date}, ${cls.start_time} to ${cls.end_time} (IST)<br/>
<strong>Was:</strong> ${was.scheduled_date}, ${was.start_time}</p>${
    joinUrl ? `\n<p><a href="${joinUrl}">🔗 Join Meeting</a></p>` : ''
  }${
    rsvpUrl
      ? `\n<p>✋ Can't make the new time? <a href="${rsvpUrl}">Tap to RSVP</a> (you're marked attending by default).</p>`
      : ''
  }`;
}

/**
 * The "what we actually covered" card, shown once a class has been wrapped up.
 *
 * States what happened, never what was planned. A student reading this three
 * weeks later wants the topic and the points, not a diff against an intention.
 * Deliberately short: the full note, the images and the recording live in Nexus,
 * which the trailing link points at.
 */
export function buildWrapUpHtml(
  cls: {
    title: string;
    scheduled_date: string;
    description?: string | null;
    summary_bullets?: string[] | null;
  },
  classUrl?: string | null,
): string {
  const bullets = (cls.summary_bullets || []).filter(Boolean).slice(0, 6);
  return `<h3>✅ ${esc(cls.title)}</h3>
<p><strong>Class on:</strong> ${esc(cls.scheduled_date)} (IST)</p>${
    cls.description ? `\n<p>${esc(cls.description)}</p>` : ''
  }${
    bullets.length
      ? `\n<p><strong>What we did</strong></p>\n<ul>${bullets
          .map((b) => `<li>${esc(b)}</li>`)
          .join('')}</ul>`
      : ''
  }${classUrl ? `\n<p><a href="${classUrl}">📖 Full notes, images and recording in Nexus</a></p>` : ''}`;
}

/** Post an HTML message to a Teams channel; returns the new message ID or null. */
export async function postChannelMessage(
  token: string,
  teamId: string,
  channelId: string,
  html: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: { contentType: 'html', content: html } }),
      },
    );
    if (!res.ok) return null;
    const posted = await res.json().catch(() => null);
    return (posted?.id as string) || null;
  } catch {
    return null;
  }
}

/** Post an HTML message to a Teams group chat; returns the new message ID or null. */
export async function postChatMessage(token: string, chatId: string, html: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: { contentType: 'html', content: html } }),
    });
    if (!res.ok) return null;
    const posted = await res.json().catch(() => null);
    return (posted?.id as string) || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the channel a meeting card should live in: the "Class Meeting Details"
 * channel by display name, falling back to General. Returns the channel id or null.
 * Used when a class has no stored channel id but we still want to post a notice.
 */
async function resolveMeetingChannelId(token: string, teamId: string): Promise<string | null> {
  const findChannel = async (name: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$filter=displayName eq '${name.replace(/'/g, "''")}'`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return (data.value?.[0]?.id as string) ?? null;
    } catch {
      return null;
    }
  };
  return (await findChannel(MEETING_CHANNEL_NAME)) || (await findChannel('General'));
}

/** Short, stable fingerprint of a rendered card, so an unchanged save posts nothing. */
function cardHash(html: string): string {
  let h = 0;
  for (let i = 0; i < html.length; i++) {
    h = (Math.imul(31, h) + html.charCodeAt(i)) | 0;
  }
  return `${html.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

/**
 * Bring the Teams card for a class up to date with its wrap-up (best-effort).
 *
 * THE CALENDAR MEETING IS NEVER TOUCHED. Microsoft cannot suppress the "meeting
 * updated" mail on a subject or body change (no flag exists; it is an open
 * feature request), and resolveClassAttendees puts every enrolled student on the
 * invite. So a typo fixed at 11pm would mail the whole cohort about a class that
 * finished hours ago. Editing a chatMessage sends no mail at all, which is why
 * the record goes to the channel card instead.
 *
 * PATCH first, reply second. Graph does allow a body edit on a chatMessage, but
 * only under DELEGATED permissions and only for a message the caller themselves
 * sent. When teacher B wraps up a class teacher A announced, the PATCH 403s and
 * the fallback posts a reply under the original card, which B is always allowed
 * to do. That is also the path taken until ChannelMessage.ReadWrite and
 * Chat.ReadWrite have been consented in Azure.
 *
 * Never throws. The class is wrapped up in Nexus the moment it is saved; a Graph
 * hiccup must not undo that or fail the teacher's save.
 */
export async function refreshClassAnnouncement(
  token: string,
  supabase: AdminClient,
  classId: string,
  classUrl?: string | null,
): Promise<void> {
  try {
    const sb = supabase as any;
    const { data: cls } = await sb
      .from('nexus_scheduled_classes')
      .select(
        'id, classroom_id, title, description, summary_bullets, scheduled_date, publish_state, meeting_group_id, teams_channel_id, teams_channel_message_id, teams_group_chat_message_id, teams_wrapup_message_id, teams_wrapup_chat_message_id, teams_wrapup_hash',
      )
      .eq('id', classId)
      .single();
    if (!cls) return;

    // A draft class has never been announced, so there is nothing to bring up to
    // date. Same rule the reschedule repost uses.
    if (cls.publish_state === 'draft') return;

    const html = buildWrapUpHtml(cls, classUrl);
    const hash = cardHash(html);
    // Five saves must not become five cards. This is the whole reason the hash
    // is stored rather than recomputed and discarded.
    if (cls.teams_wrapup_hash === hash) return;

    const { data: classroom } = await sb
      .from('nexus_classrooms')
      .select('ms_team_id, ms_group_chat_id')
      .eq('id', cls.classroom_id)
      .single();

    const authed = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const bodyPayload = JSON.stringify({ body: { contentType: 'html', content: html } });

    /** PATCH a posted message's body. True only on a real 2xx. */
    const tryEdit = async (url: string): Promise<boolean> => {
      try {
        const res = await fetch(url, { method: 'PATCH', headers: authed, body: bodyPayload });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error('Wrap-up card edit refused (falling back to a reply):', res.status, errText);
        }
        return res.ok;
      } catch (err) {
        console.error('Wrap-up card edit errored (falling back to a reply):', err);
        return false;
      }
    };

    /** Post a reply under an existing channel message; returns the new id or null. */
    const postReply = async (teamId: string, channelId: string, rootId: string): Promise<string | null> => {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${rootId}/replies`,
          { method: 'POST', headers: authed, body: bodyPayload },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error('Wrap-up reply failed (non-blocking):', res.status, errText);
          return null;
        }
        const posted = await res.json().catch(() => null);
        return (posted?.id as string) || null;
      } catch (err) {
        console.error('Wrap-up reply errored (non-blocking):', err);
        return null;
      }
    };

    const patch: Record<string, unknown> = {};

    // ─── Channel ───
    const teamId = classroom?.ms_team_id;
    const channelId = cls.teams_channel_id;
    if (teamId && channelId) {
      const existingWrapUp = cls.teams_wrapup_message_id;
      const base = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`;

      if (existingWrapUp && (await tryEdit(`${base}/${existingWrapUp}`))) {
        // Edited in place, id unchanged.
      } else if (cls.teams_channel_message_id) {
        const newId = await postReply(teamId, channelId, cls.teams_channel_message_id);
        if (newId) patch.teams_wrapup_message_id = newId;
      } else {
        // The class never got a join card (link-only, or posted before the ids
        // were tracked), so there is no thread to reply under. Post at top level.
        const resolved = await resolveMeetingChannelId(token, teamId);
        if (resolved) {
          const newId = await postChannelMessage(token, teamId, resolved, html);
          if (newId) patch.teams_wrapup_message_id = newId;
        }
      }
    }

    // ─── Group chat ───
    // Chats have no replies, so an edit that fails leaves only "post a new one".
    const chatId = classroom?.ms_group_chat_id;
    if (chatId) {
      const existingChat = cls.teams_wrapup_chat_message_id;
      const edited =
        existingChat && (await tryEdit(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages/${existingChat}`));
      if (!edited) {
        const newId = await postChatMessage(token, chatId, html);
        if (newId) patch.teams_wrapup_chat_message_id = newId;
      }
    }

    // Stamp the hash whenever anything reached Teams, including a successful
    // in-place edit that produced no new id. Without the `||` on ids, an edit-only
    // pass would leave the hash stale and re-post on the next save.
    const reachedTeams =
      Object.keys(patch).length > 0 || !!cls.teams_wrapup_message_id || !!cls.teams_wrapup_chat_message_id;
    if (reachedTeams) {
      patch.teams_wrapup_hash = hash;
      patch.teams_wrapup_posted_at = new Date().toISOString();
      await sb.from('nexus_scheduled_classes').update(patch).eq('id', classId);
    }
  } catch (err) {
    console.error('refreshClassAnnouncement failed (non-blocking):', err);
  }
}

/**
 * Remove the Teams announcement cards a class posted (best-effort, non-blocking).
 *
 * Channel and chat messages cannot be hard-deleted via Graph; softDelete removes
 * them from view. Any failure is swallowed with a log.
 */
export async function removeTeamsAnnouncements(
  token: string,
  supabase: AdminClient,
  classroomId: string,
  cls: TeamsAnnouncementRefs | null,
): Promise<void> {
  if (!cls) return;
  const needsChannel = !!(cls.teams_channel_id && cls.teams_channel_message_id);
  const needsChat = !!cls.teams_group_chat_message_id;
  if (!needsChannel && !needsChat) return;

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id, ms_group_chat_id')
    .eq('id', classroomId)
    .single();

  const softDelete = async (url: string, label: string) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`softDelete ${label} failed (non-blocking):`, res.status, errText);
      }
    } catch (err) {
      console.error(`softDelete ${label} errored (non-blocking):`, err);
    }
  };

  if (needsChannel && classroom?.ms_team_id) {
    await softDelete(
      `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels/${cls.teams_channel_id}/messages/${cls.teams_channel_message_id}/softDelete`,
      'channel post',
    );
  }

  if (needsChat && classroom?.ms_group_chat_id) {
    await softDelete(
      `https://graph.microsoft.com/v1.0/chats/${classroom.ms_group_chat_id}/messages/${cls.teams_group_chat_message_id}/softDelete`,
      'group chat post',
    );
  }
}

/**
 * Mark a cancelled class in Teams: remove any old "Join Meeting" card(s) and post a
 * "Cancelled" notice to the channel + group chat.
 *
 * Unlike before, this ALWAYS posts a notice when the classroom has a linked group
 * chat and/or meeting channel, even if the class never had a prior card, so a
 * cancelled class always shows up as cancelled in Teams (not just a vanished card).
 * If a prior card exists it is soft-deleted first. Returns the new message IDs (so a
 * later permanent delete can remove the notice too), or null when the classroom has
 * no Teams targets at all. Best-effort throughout.
 */
export async function announceCancellationToTeams(
  token: string,
  supabase: AdminClient,
  classroomId: string,
  oldRefs: TeamsAnnouncementRefs | null,
  cls: { title: string; scheduled_date: string; start_time: string; end_time: string },
): Promise<{ channelMessageId: string | null; chatMessageId: string | null } | null> {
  // Remove the stale "Join Meeting" card(s) first, if any were tracked.
  if (oldRefs) {
    await removeTeamsAnnouncements(token, supabase, classroomId, oldRefs);
  }

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id, ms_group_chat_id')
    .eq('id', classroomId)
    .single();

  if (!classroom?.ms_team_id && !classroom?.ms_group_chat_id) return null;

  const html = buildCancelledHtml(cls);
  let channelMessageId: string | null = null;
  let chatMessageId: string | null = null;

  // Channel: reuse the class's own channel if known, else resolve the meeting channel.
  if (classroom?.ms_team_id) {
    const channelId = oldRefs?.teams_channel_id || (await resolveMeetingChannelId(token, classroom.ms_team_id));
    if (channelId) {
      channelMessageId = await postChannelMessage(token, classroom.ms_team_id, channelId, html);
    }
  }

  if (classroom?.ms_group_chat_id) {
    chatMessageId = await postChatMessage(token, classroom.ms_group_chat_id, html);
  }

  return { channelMessageId, chatMessageId };
}

/**
 * Mark a moved class in Teams: soft-delete the stale "Join Meeting" card and post
 * a fresh one carrying the new time.
 *
 * Graph cannot edit a posted message body in place, which is why cancellation
 * already works this way. Without this, moving a class left a card in the channel
 * and the group chat still advertising the old day, indefinitely, and a student
 * reading Teams rather than Nexus would turn up on the wrong evening.
 *
 * Returns the new message IDs so the class row can point at the current card,
 * or null when the classroom has no Teams targets. Best-effort throughout: the
 * class has already moved by the time this runs, and a failed repost must not
 * undo that.
 */
export async function announceRescheduleToTeams(
  token: string,
  supabase: AdminClient,
  classroomId: string,
  oldRefs: TeamsAnnouncementRefs | null,
  cls: { title: string; scheduled_date: string; start_time: string; end_time: string },
  was: { scheduled_date: string; start_time: string },
  links?: { joinUrl?: string | null; rsvpUrl?: string | null },
): Promise<{ channelMessageId: string | null; chatMessageId: string | null } | null> {
  if (oldRefs) {
    await removeTeamsAnnouncements(token, supabase, classroomId, oldRefs);
  }

  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('ms_team_id, ms_group_chat_id')
    .eq('id', classroomId)
    .single();

  if (!classroom?.ms_team_id && !classroom?.ms_group_chat_id) return null;

  const html = buildRescheduledHtml(cls, was, links?.joinUrl, links?.rsvpUrl);
  let channelMessageId: string | null = null;
  let chatMessageId: string | null = null;

  if (classroom?.ms_team_id) {
    const channelId = oldRefs?.teams_channel_id || (await resolveMeetingChannelId(token, classroom.ms_team_id));
    if (channelId) {
      channelMessageId = await postChannelMessage(token, classroom.ms_team_id, channelId, html);
    }
  }

  if (classroom?.ms_group_chat_id) {
    chatMessageId = await postChatMessage(token, classroom.ms_group_chat_id, html);
  }

  return { channelMessageId, chatMessageId };
}

/**
 * A Teams delete is idempotent: 404 (Not Found) and 410 (Gone) both mean the
 * event/meeting is already absent, which is exactly the end state we want, so
 * they count as success. 204/200 are the normal success codes.
 */
export function isDeleteSettled(status: number): boolean {
  return status === 204 || status === 200 || status === 404 || status === 410;
}

/**
 * Cancel/delete a Teams meeting event (best-effort, non-blocking).
 *
 * For channel_meeting (group calendar events): DELETE /groups/{teamId}/calendar/events/{eventId},
 *   retried with the app-only token (Group.ReadWrite.All) when the teacher's delegated
 *   token lacks group-calendar access, then a standalone-meeting delete as a legacy fallback.
 * For standalone meetings: DELETE /me/onlineMeetings/{meetingId}.
 *
 * A 404/410 at any step means the meeting is already gone, so it resolves as success.
 */
export async function cancelTeamsEvent(
  token: string,
  supabase: AdminClient,
  classroomId: string,
  meetingId: string,
  scope: string | null,
): Promise<{ success: boolean; error?: string }> {
  const deleteAt = async (url: string, bearer: string): Promise<number> => {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${bearer}` } });
    if (!res.ok && !isDeleteSettled(res.status)) {
      const errText = await res.text().catch(() => '');
      console.error(`Teams delete failed (${res.status}) for ${url}:`, errText);
    }
    return res.status;
  };

  try {
    if (scope === 'channel_meeting') {
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id')
        .eq('id', classroomId)
        .single();

      if (!classroom?.ms_team_id) return { success: true };
      const eventUrl = `https://graph.microsoft.com/v1.0/groups/${classroom.ms_team_id}/calendar/events/${meetingId}`;

      // 1) Delegated teacher token.
      let status = await deleteAt(eventUrl, token);
      if (isDeleteSettled(status)) return { success: true };

      // 2) App-only token (reliably has group-calendar write even when the teacher
      //    is owner-but-not-member of the team).
      try {
        const appToken = await getAppOnlyToken();
        status = await deleteAt(eventUrl, appToken);
        if (isDeleteSettled(status)) return { success: true };
      } catch (appErr) {
        console.error('App-only group calendar delete failed:', appErr);
      }

      // 3) Legacy fallback: the record may hold a standalone online-meeting ID.
      const fallbackStatus = await deleteAt(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`,
        token,
      );
      if (isDeleteSettled(fallbackStatus)) return { success: true };

      return { success: false, error: `Could not remove meeting from Teams (${status})` };
    }

    // Standalone online meeting or personal calendar event.
    const status = await deleteAt(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`, token);
    if (isDeleteSettled(status)) return { success: true };
    return { success: false, error: `Could not remove meeting from Teams (${status})` };
  } catch (err) {
    console.error('Failed to cancel Teams event:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error cancelling Teams event' };
  }
}

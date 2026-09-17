/**
 * What an activity from Teams means for the Answer Pad, read from its JSON
 * alone. The bot route has already verified who sent it.
 *
 * The bot does three things with what it hears:
 *   - remembers the conversation (service URL, meeting, team and channel), so
 *     notifications can reach the meeting and the console can show "Meeting bot added";
 *   - turns participant join and leave events into meeting presence;
 *   - closes every open presence interval when the meeting ends.
 * Everything else, including anything a person types to the bot, is ignored.
 *
 * Payload shapes follow Microsoft's "Meeting apps APIs" examples; field names
 * that appear in more than one casing there are read in both.
 */

export const PARTICIPANT_JOIN = 'application/vnd.microsoft.meetingParticipantJoin';
export const PARTICIPANT_LEAVE = 'application/vnd.microsoft.meetingParticipantLeave';
export const MEETING_END = 'application/vnd.microsoft.meetingEnd';

const MAX_ID_LENGTH = 512;
/** One event names the people who joined or left in one moment; more than this is not a real event. */
const MAX_MEMBERS = 300;

export interface ConversationRef {
  conversationId: string;
  serviceUrl: string;
  tenantId: string | null;
  meetingId: string | null;
  teamId: string | null;
  channelId: string | null;
}

export interface ParticipantChange {
  /** Entra object id, lowercase, as users.ms_oid stores it. */
  aadObjectId: string;
  /** The 29: id notifications are addressed to, when Teams sent one. */
  teamsUserId: string | null;
}

export type BotAction =
  | { kind: 'participants'; meetingId: string; event: 'join' | 'leave'; at: string | null; members: ParticipantChange[] }
  | { kind: 'meeting-end'; meetingId: string; at: string | null }
  | { kind: 'ignore' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A trimmed, non-empty identifier of sane length, or null. */
function id(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ID_LENGTH ? trimmed : null;
}

function isoTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function conversationRef(activity: Record<string, unknown>): ConversationRef | null {
  const conversation = asRecord(activity.conversation);
  const channelData = asRecord(activity.channelData);
  const conversationId = id(conversation?.id);
  const serviceUrl = id(activity.serviceUrl);
  if (!conversationId || !serviceUrl || !/^https:\/\//i.test(serviceUrl)) return null;

  return {
    conversationId,
    serviceUrl,
    tenantId: id(asRecord(channelData?.tenant)?.id) ?? id(conversation?.tenantId),
    meetingId: id(asRecord(channelData?.meeting)?.id),
    teamId: id(asRecord(channelData?.team)?.id),
    channelId: id(asRecord(channelData?.channel)?.id),
  };
}

export function botAction(activity: Record<string, unknown>): BotAction {
  if (activity.type !== 'event') return { kind: 'ignore' };
  // Microsoft's own examples show some event names with a leading space.
  const name = typeof activity.name === 'string' ? activity.name.trim() : '';
  const value = asRecord(activity.value);
  const channelData = asRecord(activity.channelData);
  const channelMeetingId = id(asRecord(channelData?.meeting)?.id);

  if (name === PARTICIPANT_JOIN || name === PARTICIPANT_LEAVE) {
    const rawMembers = Array.isArray(value?.members) ? value.members.slice(0, MAX_MEMBERS) : [];
    const members: ParticipantChange[] = [];
    for (const raw of rawMembers) {
      const user = asRecord(asRecord(raw)?.user);
      const aadObjectId = id(user?.aadObjectId) ?? id(user?.objectId);
      // The bot's own join and leave carry no Entra object id.
      if (!aadObjectId) continue;
      const teamsUserId = id(user?.id);
      members.push({ aadObjectId: aadObjectId.toLowerCase(), teamsUserId: teamsUserId?.startsWith('29:') ? teamsUserId : null });
    }
    if (!channelMeetingId || members.length === 0) return { kind: 'ignore' };
    return {
      kind: 'participants',
      meetingId: channelMeetingId,
      event: name === PARTICIPANT_JOIN ? 'join' : 'leave',
      at: isoTime(activity.timestamp),
      members,
    };
  }

  if (name === MEETING_END) {
    const meetingId = channelMeetingId ?? id(value?.id) ?? id(value?.Id);
    if (!meetingId) return { kind: 'ignore' };
    return { kind: 'meeting-end', meetingId, at: isoTime(value?.endTime) ?? isoTime(value?.EndTime) ?? isoTime(activity.timestamp) };
  }

  return { kind: 'ignore' };
}

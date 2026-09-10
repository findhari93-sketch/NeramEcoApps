/**
 * One combined post to a classroom's Teams surfaces, naming the people it is
 * about.
 *
 * The individual half of a nudge reaches one student in their own chat. This is
 * the other half: a single message in the class channel and group chat, so the
 * group knows the same thing at the same time and a teacher does not have to say
 * it twice.
 *
 * Kept out of nudge-delivery.ts on purpose. That module is imported by half a
 * dozen crons, and none of them should be pulling Graph posting code into their
 * bundle just to write an in-app bell row.
 */

import {
  buildMentions,
  isPostError,
  postChannelMessageDetailed,
  postChatMessageDetailed,
  resolveMeetingChannelId,
  type TeamsMention,
} from './teams-class-announcements';

export interface GroupPostResult {
  channel: boolean;
  chat: boolean;
  /** Present only when a surface was attempted and refused. */
  errors: string[];
  /** True when the classroom has no Teams surface configured at all. */
  unconfigured: boolean;
}

export interface GroupPostInput {
  /** The teacher's delegated bearer. App-only cannot post a chatMessage. */
  token: string;
  supabase: any;
  classroomId: string;
  /** The body, already rendered and escaped by the caller. */
  html: string;
  /** Everyone the message is about. Rendered as @-mentions under the body. */
  people: TeamsMention[];
  /** Wording that introduces the name list, e.g. "This is for:". */
  peopleLabel?: string;
}

/**
 * Post to the classroom's channel and group chat.
 *
 * Channel preference: the assignment channel when one is chosen, then the class
 * channel, then whatever resolveMeetingChannelId can find. Unlike the assignment
 * announcer (which deliberately posts to the group chat alone when no assignment
 * channel is set) this one does fall back, because a message about a test people
 * have to redo is worth a channel post wherever the class can see it.
 *
 * Never throws. A Teams surface that refuses is reported, because the caller has
 * already written the durable in-app record and needs to say honestly which
 * parts landed.
 */
export async function postGroupMessage(input: GroupPostInput): Promise<GroupPostResult> {
  const result: GroupPostResult = { channel: false, chat: false, errors: [], unconfigured: false };

  try {
    const { data: classroom } = await input.supabase
      .from('nexus_classrooms')
      .select('ms_team_id, ms_channel_id, ms_group_chat_id, ms_assignment_channel_id')
      .eq('id', input.classroomId)
      .maybeSingle();

    if (!classroom) {
      result.unconfigured = true;
      return result;
    }

    const teamId: string | null = classroom.ms_team_id || null;
    const chatId: string | null = classroom.ms_group_chat_id || null;
    let channelId: string | null =
      classroom.ms_assignment_channel_id || classroom.ms_channel_id || null;

    if (teamId && !channelId) {
      channelId = await resolveMeetingChannelId(input.token, teamId);
    }

    if (!chatId && !(teamId && channelId)) {
      result.unconfigured = true;
      return result;
    }

    // Built once and reused for both surfaces. The mention array is index-keyed
    // into the html, so rebuilding it per surface risks the two drifting and
    // Graph rejecting the whole message.
    const named = buildMentions(input.people);
    const html = input.people.length
      ? `${input.html}<p>${input.peopleLabel || 'This is for'}: ${named.html}</p>`
      : input.html;

    if (teamId && channelId) {
      const res = await postChannelMessageDetailed(
        input.token,
        teamId,
        channelId,
        html,
        named.mentions,
      );
      if (isPostError(res)) result.errors.push(`channel: ${res.error}`);
      else result.channel = true;
    }

    if (chatId) {
      const res = await postChatMessageDetailed(input.token, chatId, html, named.mentions);
      if (isPostError(res)) result.errors.push(`group chat: ${res.error}`);
      else result.chat = true;
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Could not post to Teams');
  }

  return result;
}

import { NextRequest, NextResponse } from 'next/server';
import { botAction, conversationRef, type ConversationRef } from '@/lib/pad/bot/activity';
import { BotAuthError, verifyBotRequest } from '@/lib/pad/bot/verify-activity';
import { postToConversation } from '@/lib/pad/bot/session-card';
import { ASSISTANT_REPLY, personalConversationFrom, rememberAssistantConversation } from '@/lib/teams-assistant';
import { callPad } from '@/lib/pad/rpc';
import { padDb } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

/** Teams activities are a few kilobytes; anything near this is not one. */
const MAX_BODY_CHARS = 256 * 1024;

function empty(status: number): NextResponse {
  return new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** The bot belongs to Neram's tenant. An activity from any other tenant is acknowledged and dropped. */
function fromOurTenant(ref: ConversationRef | null): boolean {
  const tenant = process.env.AZ_TENANT_ID?.trim().toLowerCase();
  return !tenant || !ref?.tenantId || ref.tenantId.toLowerCase() === tenant;
}

/**
 * POST /api/pad/bot/messages  (the Bot Framework connector only)
 *
 * The Answer Pad bot's messaging endpoint, set on the Azure Bot resource. Teams
 * sends it what the app subscribes to: the bot being added to a meeting,
 * participants joining and leaving, and the meeting ending. Nothing in a request
 * is believed until the connector's token checks out (verify-activity.ts).
 *
 * Teams retries a delivery it thinks failed, so every write is safe to repeat:
 * the conversation is an upsert and pad_bot_participant_event ignores repeats.
 * A 500 asks for that retry.
 *
 * It also serves Neram Assistant, because it has to: a bot registration has
 * exactly one messaging endpoint, and the Assistant is the same registration as
 * the Pad (manifest.json has one bots[] entry). A 1:1 activity is handled and
 * returns before any of the meeting handling below, which would otherwise write
 * a personal chat into the Pad's conversation table as a meeting with no id.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return empty(413);

  let activity: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty(400);
    activity = parsed as Record<string, unknown>;
  } catch {
    return empty(400);
  }

  try {
    await verifyBotRequest(request.headers.get('Authorization'), activity);
  } catch (err) {
    console.error(`[pad bot] refused an activity: ${err instanceof Error ? err.message : 'unknown error'}`);
    return empty(err instanceof BotAuthError ? err.status : 401);
  }

  const ref = conversationRef(activity);
  if (!fromOurTenant(ref)) return empty(200);

  // Neram Assistant's own 1:1 chat. Caching the conversation here is what makes
  // the first real message to a student cost no Graph calls at all.
  const personal = personalConversationFrom(activity);
  if (personal) {
    try {
      await rememberAssistantConversation(personal);
    } catch {
      // The next send resolves it through Graph instead. Not worth a retry.
    }
    if (activity.type === 'message') {
      await postToConversation(
        { serviceUrl: personal.serviceUrl, conversationId: personal.conversationId },
        { type: 'message', text: ASSISTANT_REPLY, textFormat: 'plain' },
      );
    }
    return empty(200);
  }

  try {
    const supabase = padDb();

    if (ref) {
      const { error } = await supabase.rpc('pad_bot_upsert_conversation', {
        p_conversation_id: ref.conversationId,
        p_service_url: ref.serviceUrl,
        p_tenant_id: ref.tenantId,
        p_meeting_id: ref.meetingId,
        p_team_id: ref.teamId,
        p_channel_id: ref.channelId,
      });
      if (error) throw error;
    }

    const action = botAction(activity);
    if (action.kind === 'participants') {
      for (const member of action.members) {
        await callPad(supabase, 'pad_bot_participant_event', {
          p_meeting_id: action.meetingId,
          p_aad_object_id: member.aadObjectId,
          p_teams_user_id: member.teamsUserId,
          p_event: action.event,
          p_at: action.at,
        });
      }
    } else if (action.kind === 'meeting-end') {
      await callPad(supabase, 'pad_bot_meeting_end', { p_meeting_id: action.meetingId, p_at: action.at });
    }

    return empty(200);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    console.error(`[pad bot] could not record an activity${code ? ` (${code})` : ''}`);
    return empty(500);
  }
}

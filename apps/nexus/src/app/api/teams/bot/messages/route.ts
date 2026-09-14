import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { botConfig, verifyBotFrameworkJwt } from '@/lib/teams-bot';

/**
 * POST /api/teams/bot/messages   (Microsoft Teams, via the Bot Framework)
 *
 * The messaging endpoint of the Neram Assistant bot. The bot is notification
 * only: it never answers, so this route does two things.
 *
 *   1. Refuses anything not signed by the Bot Framework (401). The URL is public.
 *   2. When Teams reports the bot was added to someone's personal scope, stores
 *      that conversation, so the next reminder skips the Graph lookup.
 *
 * Everything else gets an empty 200, which is what Teams expects.
 */
export async function POST(request: NextRequest) {
  const cfg = botConfig();
  if (!cfg) return NextResponse.json({ error: 'Teams bot is not set up' }, { status: 503 });

  const activity = await request.json().catch(() => null);
  if (!activity || typeof activity !== 'object') {
    return NextResponse.json({ error: 'Bad activity' }, { status: 400 });
  }

  const check = await verifyBotFrameworkJwt(request.headers.get('authorization'), activity, { appId: cfg.appId });
  if (!check.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const botWasAdded =
      activity.type === 'conversationUpdate' &&
      activity.conversation?.conversationType === 'personal' &&
      Array.isArray(activity.membersAdded) &&
      activity.membersAdded.some((m: { id?: string }) => m?.id === activity.recipient?.id);
    const aadObjectId: string | undefined = activity.from?.aadObjectId;

    if (botWasAdded && aadObjectId && activity.conversation?.id && activity.serviceUrl) {
      const supabase = getSupabaseAdminClient() as any;
      const { data: user } = await supabase.from('users').select('id').eq('ms_oid', aadObjectId).maybeSingle();
      if (user?.id) {
        await supabase.from('nexus_teams_bot_conversations').upsert(
          {
            user_id: user.id,
            ms_oid: aadObjectId,
            conversation_id: activity.conversation.id,
            service_url: activity.serviceUrl.endsWith('/') ? activity.serviceUrl : `${activity.serviceUrl}/`,
            tenant_id: activity.conversation.tenantId || activity.channelData?.tenant?.id || cfg.tenantId,
            source: 'conversation_update',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      }
    }
  } catch (err) {
    // Never fail Teams over our own bookkeeping; the Graph path resolves it later.
    console.error('[teams-bot] could not record conversation:', err);
  }

  return new NextResponse(null, { status: 200 });
}

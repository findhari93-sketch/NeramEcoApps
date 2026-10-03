/**
 * Who is asking, for every /api/assistant route: the verified token, the users
 * row, whether this is a View-as-Student session, the feature gate, and the
 * student features the assistant may open (Ruling 25).
 */
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRequestUser } from '@/lib/study-materials';
import { assertAssistantAccess } from './access';
import type { AssistantCaller, AssistantFeatures } from './types';

export async function resolveAssistantCaller(
  authHeader: string | null,
): Promise<{ caller: AssistantCaller; supabase: any; features: AssistantFeatures }> {
  const ms = await verifyMsToken(authHeader);
  const user = await getRequestUser(authHeader);
  const supabase = getSupabaseAdminClient() as any;
  const features = await assertAssistantAccess(supabase, user);
  return {
    supabase,
    features,
    caller: {
      id: user.id, name: user.name, user_type: user.user_type, staff_role: user.staff_role, can_teach: user.can_teach,
      impersonating: Boolean(ms.impersonatorUserId),
    },
  };
}

export function baseUrlOf(request: { nextUrl: { origin: string } }): string {
  return (process.env.NEXT_PUBLIC_NEXUS_URL || request.nextUrl.origin).replace(/\/$/, '');
}

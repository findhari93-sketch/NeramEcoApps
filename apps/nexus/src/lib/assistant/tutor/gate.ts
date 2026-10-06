/**
 * The tutor's own switch, checked after the Assistant gate (flag + pilot
 * list, in resolveAssistantCaller). Off, or the question bank off, reads as
 * 404 like the Assistant does while dark. Fails closed.
 */
import { ApiError } from '@/lib/api-errors';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';
import { TUTOR_FLAG } from '../flag';
import type { AssistantFeatures } from '../types';

export async function assertTutorOn(supabase: any, features: AssistantFeatures): Promise<void> {
  if (!features.questionBank) throw new ApiError('Not found', 404);
  try {
    const { data, error } = await supabase.from('nexus_settings').select('value').eq('key', FEATURE_FLAGS_KEY).maybeSingle();
    if (error) throw error;
    if (!isFeatureEnabled(TUTOR_FLAG, resolveFlags((data?.value as Record<string, boolean>) || {}))) throw new ApiError('Not found', 404);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Not found', 404);
  }
}

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { NexusSetting } from '../../types';

/**
 * Get a Nexus setting by key.
 */
export async function getNexusSetting(
  key: string,
  client?: TypedSupabaseClient
): Promise<NexusSetting | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_settings')
    .select('*')
    .eq('key', key)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as NexusSetting;
}

/**
 * Upsert a Nexus setting.
 */
export async function upsertNexusSetting(
  key: string,
  value: unknown,
  updatedBy: string,
  client?: TypedSupabaseClient
): Promise<NexusSetting> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_settings')
    .upsert({
      key,
      value: value as any,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as NexusSetting;
}

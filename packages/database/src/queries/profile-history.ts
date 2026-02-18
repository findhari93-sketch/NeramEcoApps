// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Profile History Queries
 *
 * Database queries for user profile history and avatar management
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  User,
  UserProfileHistory,
  UserAvatar,
  UpdateUserProfileInput,
  ProfileChangeSource,
} from '../types';

// ============================================
// PROFILE UPDATE WITH HISTORY
// ============================================

/**
 * Update user profile and record changes in history
 */
export async function updateUserProfile(
  userId: string,
  updates: UpdateUserProfileInput,
  options?: {
    changedBy?: string;
    changeSource?: ProfileChangeSource;
    ipAddress?: string;
    userAgent?: string;
  },
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseAdminClient();
  const changeSource = options?.changeSource || 'user';

  // Get current user data for comparison
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  // Record changes in history
  const historyPromises: Promise<any>[] = [];

  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = currentUser[key];
    const oldValueStr = oldValue != null ? JSON.stringify(oldValue) : null;
    const newValueStr = newValue != null ? JSON.stringify(newValue) : null;

    // Only record if value actually changed
    if (oldValueStr !== newValueStr) {
      historyPromises.push(
        supabase.from('user_profile_history').insert({
          user_id: userId,
          field_name: key,
          old_value: oldValueStr,
          new_value: newValueStr,
          changed_by: options?.changedBy || null,
          change_source: changeSource,
          ip_address: options?.ipAddress || null,
          user_agent: options?.userAgent || null,
        })
      );
    }
  }

  // Execute history inserts in parallel
  await Promise.all(historyPromises);

  // Update the user
  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return updatedUser;
}

// ============================================
// PROFILE HISTORY QUERIES
// ============================================

/**
 * Get profile history for a user
 */
export async function getProfileHistory(
  userId: string,
  options?: {
    fieldName?: string;
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<UserProfileHistory[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('user_profile_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.fieldName) {
    query = query.eq('field_name', options.fieldName);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get profile history with changed_by user details
 */
export async function getProfileHistoryWithDetails(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<(UserProfileHistory & { changed_by_user?: Pick<User, 'id' | 'name' | 'email'> })[]> {
  const supabase = client || getSupabaseAdminClient();

  const query = supabase
    .from('user_profile_history')
    .select(`
      *,
      changed_by_user:users!changed_by(id, name, email)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit) {
    query.limit(options.limit);
  }

  if (options?.offset) {
    query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

// ============================================
// AVATAR QUERIES
// ============================================

/**
 * Create a new avatar record
 */
export async function createUserAvatar(
  userId: string,
  avatarData: {
    storage_path: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    width?: number;
    height?: number;
    crop_data?: {
      x: number;
      y: number;
      width: number;
      height: number;
      zoom?: number;
      rotation?: number;
    };
  },
  client?: TypedSupabaseClient
): Promise<UserAvatar> {
  const supabase = client || getSupabaseAdminClient();

  // First, unset any current avatars
  await supabase
    .from('user_avatars')
    .update({ is_current: false })
    .eq('user_id', userId)
    .eq('is_current', true);

  // Create new avatar
  const { data, error } = await supabase
    .from('user_avatars')
    .insert({
      user_id: userId,
      ...avatarData,
      is_current: true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Update user's avatar_url
  await supabase
    .from('users')
    .update({
      avatar_url: avatarData.storage_path,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  // Record in profile history
  await supabase.from('user_profile_history').insert({
    user_id: userId,
    field_name: 'avatar_url',
    old_value: null, // Could fetch old value if needed
    new_value: avatarData.storage_path,
    change_source: 'user',
  });

  return data;
}

/**
 * Get user's current avatar
 */
export async function getCurrentAvatar(
  userId: string,
  client?: TypedSupabaseClient
): Promise<UserAvatar | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('user_avatars')
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get all avatars for a user (history)
 */
export async function getUserAvatars(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
  client?: TypedSupabaseClient
): Promise<UserAvatar[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('user_avatars')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Set a specific avatar as current
 */
export async function setCurrentAvatar(
  userId: string,
  avatarId: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  // Use the database function
  const { data, error } = await supabase.rpc('set_current_avatar', {
    p_user_id: userId,
    p_avatar_id: avatarId,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete an avatar (not the current one)
 */
export async function deleteAvatar(
  userId: string,
  avatarId: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  // First check it's not current
  const { data: avatar } = await supabase
    .from('user_avatars')
    .select('is_current')
    .eq('id', avatarId)
    .eq('user_id', userId)
    .single();

  if (avatar?.is_current) {
    throw new Error('Cannot delete current avatar');
  }

  const { error } = await supabase
    .from('user_avatars')
    .delete()
    .eq('id', avatarId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return true;
}

// ============================================
// USERNAME QUERIES
// ============================================

/**
 * Check if username is available
 */
export async function checkUsernameAvailable(
  username: string,
  excludeUserId?: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase.rpc('check_username_available', {
    p_username: username,
    p_exclude_user_id: excludeUserId || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get username suggestions
 */
export async function suggestUsernames(
  baseUsername: string,
  count: number = 3,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase.rpc('suggest_usernames', {
    p_base_username: baseUsername,
    p_count: count,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get user by username (case-insensitive)
 */
export async function getUserByUsername(
  username: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Set username for a user (with availability check)
 */
export async function setUsername(
  userId: string,
  username: string,
  options?: {
    changeSource?: ProfileChangeSource;
    changedBy?: string;
  },
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseAdminClient();

  // Check availability first
  const isAvailable = await checkUsernameAvailable(username, userId, supabase);
  if (!isAvailable) {
    throw new Error('Username is already taken');
  }

  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9_.]{3,30}$/;
  if (!usernameRegex.test(username)) {
    throw new Error('Username must be 3-30 characters, alphanumeric with underscores or dots');
  }

  // Get current username for history
  const { data: currentUser } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .single();

  // Update username
  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({
      username: username.toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Record in history
  await supabase.from('user_profile_history').insert({
    user_id: userId,
    field_name: 'username',
    old_value: currentUser?.username || null,
    new_value: username.toLowerCase(),
    change_source: options?.changeSource || 'user',
    changed_by: options?.changedBy || null,
  });

  return updatedUser;
}

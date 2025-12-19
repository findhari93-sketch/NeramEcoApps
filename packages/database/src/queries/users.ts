/**
 * Neram Classes - User Queries
 * 
 * Database queries for user management
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { User, LeadProfile, StudentProfile, UserType, UserStatus } from '../types';

// ============================================
// USER QUERIES
// ============================================

/**
 * Get user by ID
 */
export async function getUserById(
  userId: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  
  return data;
}

/**
 * Get user by email
 */
export async function getUserByEmail(
  email: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Get user by phone
 */
export async function getUserByPhone(
  phone: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  // Normalize phone number
  const normalizedPhone = phone.replace(/\D/g, '');
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .or(`phone.eq.${normalizedPhone},phone.eq.+91${normalizedPhone}`)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Get user by Firebase UID
 */
export async function getUserByFirebaseUid(
  firebaseUid: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('firebase_uid', firebaseUid)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Get user by Microsoft OID
 */
export async function getUserByMsOid(
  msOid: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('ms_oid', msOid)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Create a new user
 */
export async function createUser(
  userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<User> {
  const supabase = client || getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Update user
 */
export async function updateUser(
  userId: string,
  updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<User> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Link Firebase UID to existing user
 */
export async function linkFirebaseToUser(
  userId: string,
  firebaseUid: string,
  client?: TypedSupabaseClient
): Promise<User> {
  return updateUser(userId, { firebase_uid: firebaseUid }, client);
}

/**
 * Link Microsoft OID to existing user
 */
export async function linkMicrosoftToUser(
  userId: string,
  msOid: string,
  client?: TypedSupabaseClient
): Promise<User> {
  return updateUser(userId, { ms_oid: msOid }, client);
}

/**
 * Get or create user from Firebase auth
 */
export async function getOrCreateUserFromFirebase(
  firebaseUser: {
    uid: string;
    email?: string | null;
    phoneNumber?: string | null;
    displayName?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<User> {
  const supabase = client || getSupabaseAdminClient();
  
  // First, try to find by Firebase UID
  let user = await getUserByFirebaseUid(firebaseUser.uid, supabase);
  if (user) return user;
  
  // Try to find by phone or email
  if (firebaseUser.phoneNumber) {
    user = await getUserByPhone(firebaseUser.phoneNumber, supabase);
    if (user) {
      // Link Firebase UID to existing user
      return linkFirebaseToUser(user.id, firebaseUser.uid, supabase);
    }
  }
  
  if (firebaseUser.email) {
    user = await getUserByEmail(firebaseUser.email, supabase);
    if (user) {
      // Link Firebase UID to existing user
      return linkFirebaseToUser(user.id, firebaseUser.uid, supabase);
    }
  }
  
  // Create new user
  return createUser({
    name: firebaseUser.displayName || 'User',
    email: firebaseUser.email || null,
    phone: firebaseUser.phoneNumber || null,
    username: null,
    avatar_url: null,
    firebase_uid: firebaseUser.uid,
    ms_oid: null,
    google_id: null,
    user_type: 'lead',
    status: 'active',
    email_verified: Boolean(firebaseUser.email),
    phone_verified: Boolean(firebaseUser.phoneNumber),
    preferred_language: 'en',
    last_login_at: new Date().toISOString(),
    metadata: null,
  }, supabase);
}

// ============================================
// LIST QUERIES
// ============================================

export interface ListUsersOptions {
  userType?: UserType;
  status?: UserStatus;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: keyof User;
  orderDirection?: 'asc' | 'desc';
}

/**
 * List users with filters
 */
export async function listUsers(
  options: ListUsersOptions = {},
  client?: TypedSupabaseClient
): Promise<{ users: User[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  
  const {
    userType,
    status,
    search,
    limit = 20,
    offset = 0,
    orderBy = 'created_at',
    orderDirection = 'desc',
  } = options;
  
  let query = supabase
    .from('users')
    .select('*', { count: 'exact' });
  
  // Apply filters
  if (userType) {
    query = query.eq('user_type', userType);
  }
  
  if (status) {
    query = query.eq('status', status);
  }
  
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  
  // Apply ordering and pagination
  query = query
    .order(orderBy, { ascending: orderDirection === 'asc' })
    .range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) throw error;
  
  return {
    users: data || [],
    count: count || 0,
  };
}

// ============================================
// LEAD PROFILE QUERIES
// ============================================

/**
 * Create lead profile
 */
export async function createLeadProfile(
  profileData: Omit<LeadProfile, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<LeadProfile> {
  const supabase = client || getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('lead_profiles')
    .insert(profileData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Get lead profile by user ID
 */
export async function getLeadProfileByUserId(
  userId: string,
  client?: TypedSupabaseClient
): Promise<LeadProfile | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Update lead profile (for admin review)
 */
export async function updateLeadProfile(
  profileId: string,
  updates: Partial<Omit<LeadProfile, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<LeadProfile> {
  const supabase = client || getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('lead_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// STUDENT PROFILE QUERIES
// ============================================

/**
 * Create student profile
 */
export async function createStudentProfile(
  profileData: Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<StudentProfile> {
  const supabase = client || getSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('student_profiles')
    .insert(profileData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Get student profile by user ID
 */
export async function getStudentProfileByUserId(
  userId: string,
  client?: TypedSupabaseClient
): Promise<StudentProfile | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  return data;
}

/**
 * Update student profile
 */
export async function updateStudentProfile(
  profileId: string,
  updates: Partial<Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<StudentProfile> {
  const supabase = client || getSupabaseBrowserClient();
  
  const { data, error } = await supabase
    .from('student_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// COMPOSITE QUERIES
// ============================================

/**
 * Get user with all profiles
 */
export async function getUserWithProfiles(
  userId: string,
  client?: TypedSupabaseClient
): Promise<{
  user: User;
  leadProfile: LeadProfile | null;
  studentProfile: StudentProfile | null;
} | null> {
  const supabase = client || getSupabaseBrowserClient();
  
  const user = await getUserById(userId, supabase);
  if (!user) return null;
  
  const [leadProfile, studentProfile] = await Promise.all([
    getLeadProfileByUserId(userId, supabase),
    getStudentProfileByUserId(userId, supabase),
  ]);
  
  return { user, leadProfile, studentProfile };
}

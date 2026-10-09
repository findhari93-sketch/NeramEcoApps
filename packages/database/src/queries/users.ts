// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - User Queries
 *
 * Database queries for user management
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  User, LeadProfile, StudentProfile, UserType, UserStatus,
  Payment, ScholarshipApplication, PaymentInstallment,
} from '../types';
import { findUserIdByIdentity, recordIdentity, escapeIlikeValue } from './identity';

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
  if (!email) return null;

  // Case-insensitive: Google lowercases addresses, Entra keeps admin-set casing,
  // so "Name@neramclasses.com" and "name@neramclasses.com" are one person.
  // limit(2) instead of single(): until users_email_lower_key exists everywhere a
  // case-variant pair can match twice, and single() would report "not found".
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', escapeIlikeValue(email))
    .order('created_at', { ascending: true })
    .limit(2);

  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data.find((u: User) => u.email === email) ?? data[0];
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

  // Use .limit(1) instead of .single() to handle potential duplicates gracefully
  // Order by phone_verified desc so we prefer the verified account
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .or(`phone.eq.${normalizedPhone},phone.eq.+91${normalizedPhone},phone.eq.+${normalizedPhone}`)
    .order('phone_verified', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  return data && data.length > 0 ? data[0] : null;
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
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  // A second Firebase uid for the same person (e.g. phone OTP after Google)
  // lives in user_identities, not in users.firebase_uid.
  const aliasUserId = await findUserIdByIdentity('firebase', firebaseUid, supabase);
  if (!aliasUserId) return null;
  return getUserById(aliasUserId, supabase);
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
    .insert(userData as any)
    .select()
    .single();

  if (error) throw error;
  return data as User;
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
    // @ts-ignore - Supabase types not generated
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as User;
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
 * Check if a phone number is already used by another user.
 * Returns the existing user if found, null otherwise.
 */
export async function checkPhoneExists(
  phone: string,
  excludeUserId?: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseAdminClient();
  const normalizedPhone = phone.replace(/\D/g, '');

  let query = supabase
    .from('users')
    .select('*')
    .or(`phone.eq.${normalizedPhone},phone.eq.+91${normalizedPhone},phone.eq.+${normalizedPhone}`);

  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query.limit(1);
  if (error) throw error;

  return data && data.length > 0 ? data[0] : null;
}

/**
 * The user whose VERIFIED phone is this number, other than `excludeUserId`.
 * A number someone merely typed (capture-phone, an unverified form) does not
 * own it: the student who proves it by OTP may still claim it.
 */
export async function findVerifiedPhoneOwner(
  phone: string,
  excludeUserId?: string,
  client?: TypedSupabaseClient
): Promise<User | null> {
  const supabase = client || getSupabaseAdminClient();
  const normalizedPhone = phone.replace(/\D/g, '');

  let query = supabase
    .from('users')
    .select('*')
    .eq('phone_verified', true)
    .or(`phone.eq.${normalizedPhone},phone.eq.+91${normalizedPhone},phone.eq.+${normalizedPhone}`);

  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query.limit(1);
  if (error) throw error;

  return data && data.length > 0 ? data[0] : null;
}

/**
 * Get or create user from Firebase auth.
 *
 * Lookup order: Firebase uid (users.firebase_uid, then user_identities) → the
 * token's phone → email (case-insensitive) → create.
 *
 * A match by phone or email is the same person signing in another way (Google,
 * then phone OTP). The uid is ADDED as an identity; users.firebase_uid is only
 * filled when empty and never overwritten. Overwriting it made the column
 * flip-flop between a person's two Firebase uids on alternate sign-ins.
 *
 * If the phone is already taken by another user, the new account is created
 * WITHOUT the phone to avoid duplicates. The user must verify their phone
 * separately, which will detect the conflict.
 */
export async function getOrCreateUserFromFirebase(
  firebaseUser: {
    uid: string;
    email?: string | null;
    /**
     * The token's email_verified claim. An unverified address (email/password
     * sign-up before the link is clicked) is stored but never used to find an
     * existing person, or anyone could claim an account by typing its email.
     * Omitted means verified, for callers that predate the flag.
     */
    emailVerified?: boolean;
    phoneNumber?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  },
  client?: TypedSupabaseClient
): Promise<{ user: User; isNewUser: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const emailVerified = firebaseUser.emailVerified !== false;

  // Build profile updates from Firebase data (fill missing fields)
  function buildProfileUpdates(existingUser: User): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    if (firebaseUser.displayName && (!existingUser.name || existingUser.name === 'User')) {
      updates.name = firebaseUser.displayName;
    }
    if (firebaseUser.email && !existingUser.email) {
      updates.email = firebaseUser.email;
      updates.email_verified = emailVerified;
    } else if (
      emailVerified &&
      firebaseUser.email &&
      !existingUser.email_verified &&
      existingUser.email?.toLowerCase() === firebaseUser.email.toLowerCase()
    ) {
      // The student clicked the verification link since the last sign-in.
      updates.email_verified = true;
    }
    if (firebaseUser.photoURL && !existingUser.avatar_url) {
      updates.avatar_url = firebaseUser.photoURL;
    }
    return updates;
  }

  const remember = (userId: string) =>
    recordIdentity(
      userId,
      'firebase',
      firebaseUser.uid,
      { email: firebaseUser.email ?? null, phone: firebaseUser.phoneNumber ?? null },
      supabase,
    );

  // Attach this sign-in to an existing person without taking over their
  // primary uid: fill users.firebase_uid only when it is empty.
  async function attach(existing: User): Promise<{ user: User; isNewUser: boolean }> {
    const updates: Record<string, unknown> = { ...buildProfileUpdates(existing) };
    if (!existing.firebase_uid) updates.firebase_uid = firebaseUser.uid;
    const user = await applyProfileUpdates(existing, updates);
    await remember(user.id);
    return { user, isNewUser: false };
  }

  // Profile fill-ins never fail a sign-in: if the email now collides with
  // another row (users.email is unique), keep everything else and skip it.
  async function applyProfileUpdates(existing: User, updates: Record<string, unknown>): Promise<User> {
    if (Object.keys(updates).length === 0) return existing;
    try {
      return await updateUser(existing.id, updates, supabase);
    } catch (error: any) {
      if (error?.code !== '23505' || !('email' in updates)) throw error;
      const { email: _email, email_verified: _verified, ...rest } = updates;
      return Object.keys(rest).length > 0 ? updateUser(existing.id, rest, supabase) : existing;
    }
  }

  // First, the uid itself (primary column, then any recorded second identity).
  let user = await getUserByFirebaseUid(firebaseUser.uid, supabase);
  if (user) {
    const result = await applyProfileUpdates(user, buildProfileUpdates(user));
    await remember(result.id);
    return { user: result, isNewUser: false };
  }

  // The token's phone is verified by Firebase: same person.
  if (firebaseUser.phoneNumber) {
    user = await getUserByPhone(firebaseUser.phoneNumber, supabase);
    if (user) return attach(user);
  }

  // Same verified email, whatever the casing. Never on an unverified address.
  if (firebaseUser.email && emailVerified) {
    user = await getUserByEmail(firebaseUser.email, supabase);
    if (user) return attach(user);
  }

  // Before creating: double-check phone isn't already taken
  // (covers race conditions and edge cases)
  let phoneForNewUser = firebaseUser.phoneNumber || null;
  let phoneVerifiedForNewUser = Boolean(firebaseUser.phoneNumber);
  if (firebaseUser.phoneNumber) {
    const existingPhoneUser = await checkPhoneExists(firebaseUser.phoneNumber, undefined, supabase);
    if (existingPhoneUser) {
      console.warn(
        `Phone already belongs to user ${existingPhoneUser.id}. ` +
        `Creating new user (Firebase UID: ${firebaseUser.uid}) without phone.`
      );
      phoneForNewUser = null;
      phoneVerifiedForNewUser = false;
    }
  }

  // An unverified address that already belongs to someone stays off the new
  // row (users.email is unique); it is added once verified, if still free.
  let emailForNewUser = firebaseUser.email || null;
  if (emailForNewUser && !emailVerified && (await getUserByEmail(emailForNewUser, supabase))) {
    emailForNewUser = null;
  }

  // Create new user. Two sign-in calls can race here (the page and the dialog
  // both register the user); the loser of the UNIQUE(firebase_uid) race reads
  // the winner's row instead of failing.
  let newUser: User;
  try {
    newUser = await createUser({
      name: firebaseUser.displayName || 'User',
      email: emailForNewUser,
      phone: phoneForNewUser,
      username: null,
      avatar_url: firebaseUser.photoURL || null,
      firebase_uid: firebaseUser.uid,
      ms_oid: null,
      google_id: null,
      user_type: 'lead',
      status: 'active',
      email_verified: Boolean(emailForNewUser) && emailVerified,
      phone_verified: phoneVerifiedForNewUser,
      preferred_language: 'en',
      last_login_at: new Date().toISOString(),
      metadata: null,
    }, supabase);
  } catch (error: any) {
    if (error?.code !== '23505') throw error;
    const winner = await getUserByFirebaseUid(firebaseUser.uid, supabase);
    if (!winner) throw error;
    return { user: winner, isNewUser: false };
  }
  await remember(newUser.id);
  return { user: newUser, isNewUser: true };
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
    .insert(profileData as any)
    .select()
    .single();

  if (error) throw error;
  return data as LeadProfile;
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
    // @ts-ignore - Supabase types not generated
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  return data as LeadProfile;
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
    .insert(profileData as any)
    .select()
    .single();

  if (error) throw error;
  return data as StudentProfile;
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
    // @ts-ignore - Supabase types not generated
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  return data as StudentProfile;
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

// ============================================
// FULL PROFILE (for profile page)
// ============================================

export interface FullUserProfile {
  user: User;
  leadProfile: LeadProfile | null;
  studentProfile: StudentProfile | null;
  payments: Payment[];
  scholarshipApplication: ScholarshipApplication | null;
  installments: PaymentInstallment[];
  courseName: string | null;
  batchName: string | null;
  centerName: string | null;
  centerCity: string | null;
}

/**
 * Get comprehensive user profile with all related data.
 * Used by the profile page to display application, enrollment,
 * payment, and scholarship information.
 */
export async function getFullUserProfile(
  userId: string,
  client?: TypedSupabaseClient
): Promise<FullUserProfile | null> {
  const supabase = client || getSupabaseAdminClient();

  // Round 1: Fetch core data in parallel
  const [user, leadProfile, studentProfile] = await Promise.all([
    getUserById(userId, supabase),
    getLeadProfileByUserId(userId, supabase),
    getStudentProfileByUserId(userId, supabase),
  ]);

  if (!user) return null;

  // Round 2: Fetch dependent data in parallel
  const courseId = studentProfile?.course_id || leadProfile?.selected_course_id;
  const batchId = studentProfile?.batch_id;
  const centerId = leadProfile?.selected_center_id;
  const leadProfileId = leadProfile?.id;

  const [paymentsResult, scholarshipResult, installmentsResult, courseResult, batchResult, centerResult] = await Promise.all([
    // Payments for this user (paid + pending, most recent first)
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['paid', 'pending'])
      .order('created_at', { ascending: false })
      .limit(20),
    // Scholarship application
    leadProfileId
      ? supabase
          .from('scholarship_applications')
          .select('*')
          .eq('lead_profile_id', leadProfileId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Payment installments
    leadProfileId
      ? supabase
          .from('payment_installments')
          .select('*')
          .eq('lead_profile_id', leadProfileId)
          .order('installment_number', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    // Course name
    courseId
      ? supabase
          .from('courses')
          .select('name')
          .eq('id', courseId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Batch name
    batchId
      ? supabase
          .from('batches')
          .select('name')
          .eq('id', batchId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Center name
    centerId
      ? supabase
          .from('offline_centers')
          .select('name, city')
          .eq('id', centerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    user,
    leadProfile,
    studentProfile,
    payments: (paymentsResult.data as Payment[]) || [],
    scholarshipApplication: (scholarshipResult.data as ScholarshipApplication | null) || null,
    installments: (installmentsResult.data as PaymentInstallment[]) || [],
    courseName: (courseResult.data as any)?.name || null,
    batchName: (batchResult.data as any)?.name || null,
    centerName: (centerResult.data as any)?.name || null,
    centerCity: (centerResult.data as any)?.city || null,
  };
}

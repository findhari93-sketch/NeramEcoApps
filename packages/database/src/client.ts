/**
 * Neram Classes - Supabase Client
 * 
 * Provides configured Supabase clients for different contexts:
 * - Browser client (for client-side operations)
 * - Server client (for server-side operations with service role)
 * - Admin client (for admin operations)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ============================================
// ENVIRONMENT VARIABLES
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ============================================
// TYPE DEFINITIONS
// ============================================

export type TypedSupabaseClient = SupabaseClient<Database>;

// ============================================
// BROWSER CLIENT
// ============================================

let browserClient: TypedSupabaseClient | null = null;

/**
 * Get Supabase client for browser/client-side operations
 * Uses the anonymous key with RLS policies
 */
export function getSupabaseBrowserClient(): TypedSupabaseClient {
  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

// ============================================
// SERVER CLIENT
// ============================================

/**
 * Create Supabase client for server-side operations
 * Should be called per-request to avoid caching issues
 */
export function createServerClient(): TypedSupabaseClient {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ============================================
// ADMIN CLIENT (Service Role)
// ============================================

let adminClient: TypedSupabaseClient | null = null;

/**
 * Get Supabase admin client with service role key
 * Bypasses RLS policies - use with caution!
 */
export function getSupabaseAdminClient(): TypedSupabaseClient {
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  if (!adminClient) {
    adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Handle Supabase errors consistently
 */
export function handleSupabaseError(error: unknown): never {
  if (error && typeof error === 'object' && 'message' in error) {
    throw new Error(`Supabase error: ${(error as { message: string }).message}`);
  }
  throw new Error('Unknown Supabase error');
}

// ============================================
// DEFAULT EXPORT
// ============================================

export const supabase = getSupabaseBrowserClient;

export default supabase;

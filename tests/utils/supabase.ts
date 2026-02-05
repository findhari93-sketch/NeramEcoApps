/**
 * Supabase Test Utilities
 *
 * Helpers for testing with Supabase - local and mock clients.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

// Local Supabase instance configuration (from `supabase start`)
const SUPABASE_LOCAL_URL = 'http://127.0.0.1:54321';
const SUPABASE_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Create a test client connected to local Supabase
 * Use this for integration tests that need a real database
 */
export function createTestClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_TEST_URL || SUPABASE_LOCAL_URL,
    process.env.SUPABASE_TEST_ANON_KEY || SUPABASE_LOCAL_ANON_KEY
  );
}

/**
 * Create an admin test client with service role
 * Use this for setup/teardown operations that bypass RLS
 */
export function createTestAdminClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_TEST_URL || SUPABASE_LOCAL_URL,
    process.env.SUPABASE_TEST_SERVICE_KEY || SUPABASE_LOCAL_SERVICE_KEY
  );
}

/**
 * Create a mock Supabase client for unit tests
 * Use this when you don't need a real database connection
 */
export function createMockSupabaseClient() {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  return {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.jpg' } }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/**
 * Reset database to initial state
 * Runs supabase db reset which applies migrations and seed data
 */
export async function resetDatabase(): Promise<void> {
  const { execSync } = await import('child_process');
  execSync('npx supabase db reset --local', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

/**
 * Seed test data for a specific test suite
 */
export async function seedTestData(
  client: SupabaseClient,
  tableName: string,
  data: Record<string, unknown>[]
): Promise<void> {
  const { error } = await client.from(tableName).insert(data);
  if (error) {
    throw new Error(`Failed to seed ${tableName}: ${error.message}`);
  }
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(
  client: SupabaseClient,
  tableName: string,
  condition: { column: string; value: string | string[] }
): Promise<void> {
  const query = client.from(tableName).delete();

  if (Array.isArray(condition.value)) {
    await query.in(condition.column, condition.value);
  } else {
    await query.eq(condition.column, condition.value);
  }
}

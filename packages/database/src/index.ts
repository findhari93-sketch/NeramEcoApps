/**
 * Neram Classes - Database Package
 * 
 * Supabase client, types, and queries for Neram Classes ecosystem
 */

// Client
export {
  getSupabaseBrowserClient,
  createServerClient,
  getSupabaseAdminClient,
  isSupabaseConfigured,
  handleSupabaseError,
  supabase,
} from './client';
export type { TypedSupabaseClient } from './client';

// Types
export * from './types';

// Queries
export * from './queries';

// Services
export {
  sendEmail,
  sendTemplateEmail,
  notifyAdmin,
} from './services/email';
export type { EmailData, TemplateData } from './services/email';

// Data
export {
  locations,
  getLocationByCity,
  getLocationsByState,
  getLocationsByRegion,
  getAllCities,
} from './data/locations';
export type { Location } from './data/locations';

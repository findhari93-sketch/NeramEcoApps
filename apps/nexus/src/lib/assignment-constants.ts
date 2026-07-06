/**
 * Client-safe assignment constants. The server source of truth is
 * ASSIGNMENT_ATTACHMENTS_FOLDER_ID in packages/database (queries/nexus/assignments.ts);
 * duplicated here so client components do not import the server-only query module
 * (which pulls in the service-role Supabase client).
 */
export const ASSIGNMENT_ATTACHMENTS_FOLDER_ID = 'a0000000-0000-4000-8000-000000000001';

/** Private bucket that holds student submission files (uploads via signed URLs). */
export const ASSIGNMENT_SUBMISSIONS_BUCKET = 'assignment-submissions';

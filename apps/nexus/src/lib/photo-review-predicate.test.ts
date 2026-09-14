/**
 * Drift guard for the photo review badge.
 *
 * The sidebar badge and the /teacher/photo-review queue have to describe the
 * same population, and they have now drifted three separate times: an unnamed
 * foreign key once emptied the queue entirely, then the badge counted ~1,350
 * marketing leads, and most recently production ran a function body with no
 * ms_oid rule for six weeks while the queue filtered on it.
 *
 * The queue's rule is TypeScript (lib/photo-roster.ts, lib/microsoft-account.ts)
 * and the badge's rule is SQL, so nothing else can hold them together. This
 * reads the migration and asserts the SQL still carries every clause the queue
 * applies. Whitespace is normalised so reformatting passes, but a dropped clause
 * fails.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { hasMicrosoftAccount } from './microsoft-account';
import { PHOTO_ROSTER_PARTICIPATION } from './photo-review-roster';

// The newest migration that (re)defines the function. Point this at the next one
// whenever the body changes again, or the guard checks a body prod no longer runs.
const MIGRATION = resolve(
  __dirname,
  '../../../../supabase/migrations/20260919090000_nexus_not_started_participation.sql',
);

const full = readFileSync(MIGRATION, 'utf8');
// Only the badge section (drop, create, grants): the same migration also has
// backfills and a trigger with similar-looking clauses.
const badgeStart = full.indexOf('-- 9. Photo review badge');
const sql = full.slice(badgeStart >= 0 ? badgeStart : full.length).replace(/\s+/g, ' ');

describe('count_pending_photo_reviews', () => {
  it('counts only students the queue would also show', () => {
    expect(sql).toContain('u.photo_status = \'pending\'');
    expect(sql).toContain('u.is_alumni IS NOT TRUE');
    expect(sql).toContain("e.role = 'student'");
    expect(sql).toContain('u.ms_oid IS NOT NULL');
  });

  // Paused students are in no list and no count, but Not started students are who
  // Photo Review is for. The queue and the badge must draw that line identically.
  it('includes Not started students and leaves out staff pauses, same as the queue', () => {
    expect(sql).toContain("(e.participation_status = 'active' OR e.dormant_source = 'auto')");
    expect(PHOTO_ROSTER_PARTICIPATION).toBe('participation_status.eq.active,dormant_source.eq.auto');
  });

  /** Both halves of one rule, asserted together so it reads as a pair. */
  it('agrees with hasMicrosoftAccount about the empty string', () => {
    expect(hasMicrosoftAccount('')).toBe(false);
    expect(sql).toContain("u.ms_oid <> ''");
  });

  it('is scoped to the viewer, not the whole tenant', () => {
    expect(sql).toContain('p_user_id uuid');
    expect(sql).toContain('WHERE e.user_id = p_user_id');
  });

  /** CREATE OR REPLACE cannot change a signature, so without the drop the
   *  tenant-wide zero-arg version survives one forgotten argument away. */
  it('drops the tenant-wide overload rather than leaving it behind', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS');
  });

  /** Grants do not survive a DROP, and a new function defaults to EXECUTE TO
   *  PUBLIC. This one is SECURITY DEFINER and takes an arbitrary user id. */
  it('is executable only by the service role', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM authenticated',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.count_pending_photo_reviews(uuid) TO service_role',
    );
  });
});

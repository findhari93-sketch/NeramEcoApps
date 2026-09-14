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

const MIGRATION = resolve(
  __dirname,
  '../../../../supabase/migrations/20260918090200_photo_review_badge_hide_paused.sql',
);

const sql = readFileSync(MIGRATION, 'utf8').replace(/\s+/g, ' ');

describe('count_pending_photo_reviews', () => {
  it('counts only students the queue would also show', () => {
    expect(sql).toContain('u.photo_status = \'pending\'');
    expect(sql).toContain('u.is_alumni IS NOT TRUE');
    expect(sql).toContain("e.role = 'student'");
    expect(sql).toContain('u.ms_oid IS NOT NULL');
    // Paused students are in no list and no count (loadPhotoRoster filters the same).
    expect(sql).toContain("e.participation_status = 'active'");
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

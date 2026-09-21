// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`, so this cannot opt into the node environment. Node's fs and
// path are available either way.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail for a migration that could never be applied.
 *
 * `supabase db push` keys on a migration's VERSION, the part of the filename
 * before the first underscore, not on the filename. Two files that share a
 * version are one migration as far as the CLI is concerned: once either is
 * recorded in `supabase_migrations.schema_migrations`, the other counts as
 * satisfied and is skipped, silently, on every deploy for ever.
 *
 * That happened. `20260921090000_nexus_qb_drawing_parts.sql` and
 * `20260921090000_nexus_sketchbook_hub.sql` shared a version. The first was
 * recorded on production; the second never ran. Production ended up without
 * `drawing_submissions.inspiration_item_id`, which `SKETCH_COLUMNS` asks
 * PostgREST for by name, so every sketchbook read answered an error and the
 * teacher's Flip through tab showed a grey skeleton with no message and no
 * retry. It cost a live feature, and it would never have healed on its own:
 * every future deploy would skip the file again.
 *
 * GRANDFATHERED below are the collisions that predate this test. They are
 * listed rather than renamed on purpose. Their content is already applied in
 * every environment, and renaming a file the CLI has already recorded makes it
 * run a second time, which is a real risk for any migration that is not
 * idempotent. Listing them costs nothing and still blocks every new one.
 *
 * To add a migration: give it a fresh 14-digit timestamp. If this test fails,
 * do not add your version to the list, rename your file.
 */

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations');

/** The version is everything before the first underscore, as the CLI reads it. */
const versionOf = (filename: string): string => filename.split('_')[0];

/**
 * Collisions that existed before this guardrail. Two eras are represented: the
 * early 8-digit date-only names (several migrations a day, all sharing that
 * day's version) and six later 14-digit pairs. Never add to this list.
 */
const GRANDFATHERED = new Set([
  '20260314', '20260315', '20260316', '20260317', '20260318', '20260327',
  '20260328', '20260330', '20260331', '20260403', '20260407', '20260408',
  '20260409', '20260413', '20260416', '20260417', '20260418', '20260419',
  '20260420', '20260429', '20260506', '20260507', '20260508', '20260509',
  '20260726090000', '20260727100000', '20260728090000', '20260730090000',
  '20260804090000', '20260809090000', '20260922090000',
]);

describe('supabase migration versions', () => {
  it('never lets two NEW migration files share a version', () => {
    const byVersion = new Map<string, string[]>();
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      const version = versionOf(file);
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()]
      .filter(([version, files]) => files.length > 1 && !GRANDFATHERED.has(version))
      .map(([version, files]) => `${version}: ${files.join(' + ')}`)
      .sort();

    expect(collisions).toEqual([]);
  });

  it('keeps the grandfathered list honest, so a fixed collision cannot linger in it', () => {
    const versions = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .map(versionOf);
    const duplicated = new Set(versions.filter((v, i) => versions.indexOf(v) !== i));

    const staleExceptions = [...GRANDFATHERED].filter((v) => !duplicated.has(v)).sort();

    expect(staleExceptions).toEqual([]);
  });
});

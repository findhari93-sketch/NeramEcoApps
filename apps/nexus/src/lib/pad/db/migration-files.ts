/**
 * The Answer Pad's migration files, in the order they apply: the base
 * `<version>_answer_pad.sql`, then every follow-up named
 * `<version>_answer_pad_<what>.sql`, oldest first. The PGlite harness and the
 * refusal-code check both read this list, so a follow-up is tested the moment
 * it exists.
 */
import { readdirSync } from 'fs';
import path from 'path';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../../supabase/migrations');

export function answerPadMigrationFiles(dir: string = MIGRATIONS_DIR): { base: string; followUps: string[] } {
  const names = readdirSync(dir).sort();
  const base = names.find((name) => /^\d+_answer_pad\.sql$/.test(name));
  if (!base) throw new Error(`answer pad migration not found in ${dir}`);
  const followUps = names.filter((name) => /^\d+_answer_pad_[a-z0-9_]+\.sql$/.test(name) && name > base);
  return { base: path.join(dir, base), followUps: followUps.map((name) => path.join(dir, name)) };
}

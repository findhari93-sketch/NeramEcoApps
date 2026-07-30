#!/usr/bin/env node
/**
 * Fails loudly, in well under a second, if a build-time-generated source file
 * that application code imports statically is missing.
 *
 * Runs right after `pnpm install` in every CI job that starts a server. Without
 * it, a missing generated module surfaces only as:
 *
 *     Error: Timed out waiting 120000ms from config.webServer.
 *
 * 120 seconds later, with no indication of the cause. That exact failure kept
 * the E2E workflow red from 2026-04-17 to 2026-07-30.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED = [
  {
    file: 'apps/marketing/src/lib/generated-search-index.ts',
    producedBy:
      'scripts/generate-search-index.ts (real data, run by `build`) or ' +
      'scripts/ensure-search-index.mjs (empty placeholder, run by postinstall and `dev`)',
    importedBy:
      'apps/marketing/src/lib/search-index.ts -> SearchDialog.tsx -> Header.tsx -> root layout',
  },
];

const missing = REQUIRED.filter((r) => !existsSync(resolve(ROOT, r.file)));

if (missing.length > 0) {
  console.error('\n=== MISSING BUILD-TIME GENERATED SOURCES ===\n');
  for (const m of missing) {
    console.error(`  ${m.file}`);
    console.error(`    produced by : ${m.producedBy}`);
    console.error(`    imported by : ${m.importedBy}\n`);
  }
  console.error('Every app importing one of these will return HTTP 500 on every request.');
  console.error('Fix: run `pnpm install` (postinstall writes placeholders) or `pnpm build`.\n');
  process.exit(1);
}

console.log(`[check-generated-artifacts] ok (${REQUIRED.length} checked)`);

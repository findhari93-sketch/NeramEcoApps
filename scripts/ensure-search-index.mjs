#!/usr/bin/env node
/**
 * Guarantees apps/marketing/src/lib/generated-search-index.ts exists.
 *
 * That file is gitignored (apps/marketing/.gitignore) and produced only by
 * scripts/generate-search-index.ts, yet src/lib/search-index.ts imports it
 * statically and sits on the hot path of every page:
 *
 *   generated-search-index -> search-index.ts -> SearchDialog.tsx
 *                          -> Header.tsx -> the root layout
 *
 * On a fresh checkout the specifier does not resolve, so `next dev` answers
 * HTTP 500 to every request. Playwright's webServer probe accepts 2xx/3xx/4xx
 * but keeps polling on 5xx, so it burned its full 120s timeout and reported
 * only "Timed out waiting 120000ms from config.webServer" with no cause. That
 * kept CI red from 2026-04-17 onward.
 *
 * This writes an EMPTY but structurally valid index, and only when the file is
 * absent. It never overwrites real data and never touches the network, so it is
 * safe to run from postinstall and on every dev-server start. `build` still
 * runs the real generator unconditionally, so production always ships real data.
 */
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/marketing/src/lib/generated-search-index.ts'
);

if (existsSync(OUTPUT_PATH)) {
  process.exit(0);
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

// Same shape the real generator emits on its three defensive paths, so the
// type contract with search-index.ts is identical.
writeFileSync(
  OUTPUT_PATH,
  [
    '// AUTO-GENERATED PLACEHOLDER - DO NOT EDIT',
    '// Written by scripts/ensure-search-index.mjs because the real index was missing.',
    '// For real college data run: pnpm --filter @neram/marketing run search-index',
    "import type { SearchEntry } from './search-index';",
    'export const GENERATED_COLLEGE_INDEX: SearchEntry[] = [];',
    '',
  ].join('\n'),
  'utf-8'
);

console.log('[ensure-search-index] wrote placeholder ->', OUTPUT_PATH);

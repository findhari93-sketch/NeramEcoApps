// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`. Node's fs and path are available either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail for how the marketing build runs its search-index generator.
 *
 * The build ran `npx tsx ../../scripts/generate-search-index.ts`. tsx is not a
 * declared dependency: npx used to download it on the spot. Then the root
 * `vercel` CLI devDependency started pulling tsx in (through @vercel/node), so
 * npx found tsx somewhere in the tree, assumed it was installed and ran a `tsx`
 * command pnpm never links for an undeclared package. Every marketing build
 * failed with "sh: 1: tsx: not found" before next build even started, and the
 * site stayed on its 2026-08-07 deploy unnoticed until 2026-09-22.
 *
 * `pnpm dlx` always fetches its own copy, whatever the workspace happens to hold.
 */

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../apps/marketing/package.json'), 'utf8'));
const scripts: Record<string, string> = pkg.scripts ?? {};

describe('marketing build scripts', () => {
  it.each(['build', 'search-index'])('%s runs tsx through pnpm dlx, never npx', (name) => {
    expect(scripts[name]).toContain('generate-search-index.ts');
    expect(scripts[name]).not.toMatch(/\bnpx\s+tsx\b/);
    expect(scripts[name]).toMatch(/\bpnpm dlx tsx\b/);
  });
});

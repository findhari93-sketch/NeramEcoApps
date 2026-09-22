// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`. Node's fs and path are available either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail: Nexus must not ship the Firebase Auth SDK (perf audit PERF-0053).
 *
 * useNexusAuth imports its Microsoft helpers from the `@neram/auth` barrel, which
 * also re-exports ./firebase and the server-only ./graph. Next did not tree-shake
 * that barrel, so the root layout of every Nexus page carried the Firebase Auth SDK
 * (a 28 KB gzip chunk holding identitytoolkit.googleapis.com, measured on build
 * czq59NBfmlgbnYo9PkESe), though Nexus never signs anyone in with Firebase.
 *
 * `optimizePackageImports` rewrites those barrel imports into direct ones inside
 * Nexus, the same fix already used for `@neram/ui`, without touching packages/auth
 * (a packages/ change rebuilds and redeploys all four apps). Removing the entry
 * brings the SDK back into every page.
 */

const config = readFileSync(resolve(__dirname, '../../apps/nexus/next.config.js'), 'utf8');

describe('Nexus bundle: the @neram/auth barrel', () => {
  it('is rewritten into direct imports, so Firebase stays out of every page', () => {
    const list = /optimizePackageImports:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(list).toContain("'@neram/auth'");
  });
});

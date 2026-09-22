// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`. Node's fs and path are available either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail for the Node.js version Nexus runs on in production.
 *
 * The Vercel project for Nexus (neram-nexus-new) was set to Node.js 24.x while
 * Nexus runs Next 14.2, which supports Node 18.18, 20 and 22 only. On Node 24,
 * Next 14.2's worker processes crash on heavy routes ("Jest worker encountered
 * N child process exceptions"), which was proven in dev and was a production
 * risk (perf audit PERF-0008, 2026-09-21).
 *
 * `engines.node` in the app's package.json overrides the project setting on
 * Vercel, so the pin lives in the repo where it is reviewed. Node 20 is past its
 * end of life, so 22 is the pin. Raise it only together with a Next upgrade that
 * supports the new version.
 */

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../apps/nexus/package.json'), 'utf8'));
const next = String(pkg.dependencies?.next ?? '');

describe('Nexus Node.js runtime', () => {
  it('pins a Node major that its Next version supports', () => {
    expect(next).toMatch(/^\^?14\./);
    expect(pkg.engines?.node).toBe('22.x');
  });
});

// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`, so this cannot opt into the node environment. Node's fs and
// path are available either way.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail for a real three-month CI outage.
 *
 * apps/marketing/src/lib/generated-search-index.ts is gitignored and produced
 * by a codegen step. It is imported statically by the marketing root layout, so
 * when it is absent every request 500s. `build` ran the codegen; `dev` did not.
 * Nothing noticed the asymmetry, and because Playwright's webServer probe keeps
 * polling on 5xx, the only symptom was:
 *
 *     Error: Timed out waiting 120000ms from config.webServer.
 *
 * These tests assert the invariant that was missing: every script that can
 * START or TYPE-CHECK an app must guarantee that app's generated sources exist.
 * They run in the fast unit-test job, so the feedback is seconds, not a CI cycle.
 */

const ROOT = resolve(__dirname, '../..');

/** A regex that matches any step which guarantees the generated file exists. */
const GUARANTEES_SEARCH_INDEX = /(ensure-search-index\.mjs|generate-search-index\.ts)/;

const GENERATED_SOURCES = [
  {
    generated: 'apps/marketing/src/lib/generated-search-index.ts',
    packageJson: 'apps/marketing/package.json',
    // Any script that boots or type-checks the app must produce this first.
    mustGuaranteeIn: ['dev', 'build', 'type-check'],
    matcher: GUARANTEES_SEARCH_INDEX,
  },
] as const;

function readScripts(packageJsonPath: string): Record<string, string> {
  const raw = readFileSync(resolve(ROOT, packageJsonPath), 'utf-8');
  return (JSON.parse(raw).scripts ?? {}) as Record<string, string>;
}

describe('build-time generated sources', () => {
  describe.each(GENERATED_SOURCES)('$generated', (entry) => {
    it.each(entry.mustGuaranteeIn)(
      'the "%s" script guarantees it exists',
      (scriptName) => {
        const scripts = readScripts(entry.packageJson);
        const script = scripts[scriptName];

        expect(script, `${entry.packageJson} has no "${scriptName}" script`).toBeDefined();

        expect(
          entry.matcher.test(script ?? ''),
          `${entry.packageJson} script "${scriptName}" is:\n` +
            `    ${script}\n` +
            `  It must first run a step that creates ${entry.generated}, because\n` +
            `  that file is gitignored and imported statically by app code.\n` +
            `  Without it the app returns HTTP 500 on every request, and Playwright\n` +
            `  reports only "Timed out waiting 120000ms from config.webServer".\n` +
            `  Add: node ../../scripts/ensure-search-index.mjs && ...`
        ).toBe(true);
      }
    );
  });

  it('the root postinstall creates every generated source', () => {
    const rootScripts = readScripts('package.json');
    expect(
      GUARANTEES_SEARCH_INDEX.test(rootScripts.postinstall ?? ''),
      `Root "postinstall" is:\n    ${rootScripts.postinstall}\n` +
        `  It must run scripts/ensure-search-index.mjs so that a fresh clone and\n` +
        `  every CI job have the generated sources before anything imports them.`
    ).toBe(true);
  });

  it('the CI artifact check lists every generated source', () => {
    const checkPath = 'scripts/ci/check-generated-artifacts.mjs';
    expect(existsSync(resolve(ROOT, checkPath)), `${checkPath} is missing`).toBe(true);

    const check = readFileSync(resolve(ROOT, checkPath), 'utf-8');
    for (const entry of GENERATED_SOURCES) {
      expect(
        check.includes(entry.generated),
        `${checkPath} does not check ${entry.generated}, so CI would not catch it going missing.`
      ).toBe(true);
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { stripLineComments } from './allowlist-jsonc';

/**
 * The allowlist that says which faces may stay plain.
 *
 * An entry naming a file that no longer exists is a dead exception. It does not
 * fail lint, it does not fail the build, and it quietly makes the list look
 * considered when it is stale. Two adoption passes of the cohort ring were lost
 * to exactly that kind of silent drift, so the list gets a test.
 */

const APP_ROOT = join(__dirname, '..', '..', '..');

interface Override {
  files: string[];
  rules?: Record<string, unknown>;
}

// ESLint reads .eslintrc.json as JSON with JavaScript-style comments, and the
// allowlist uses them to carry each exception's reason. JSON.parse does not.
function readConfig(): { overrides?: Override[] } {
  const raw = readFileSync(join(APP_ROOT, '.eslintrc.json'), 'utf8');
  return JSON.parse(stripLineComments(raw));
}

function allowlistedFiles(): string[] {
  const overrides = readConfig().overrides || [];
  return (
    overrides
      .filter((o) => o.rules && o.rules['no-restricted-syntax'] === 'off')
      .flatMap((o) => o.files)
      // A glob covers a whole zone and cannot be existence-checked file by file.
      .filter((f) => !f.includes('*'))
  );
}

describe('avatar allowlist', () => {
  it('names only files that still exist', () => {
    const missing = allowlistedFiles().filter((f) => !existsSync(join(APP_ROOT, f)));
    expect(missing).toEqual([]);
  });

  it('does not excuse StudentIdentityLine, which was fixed rather than exempted', () => {
    expect(allowlistedFiles()).not.toContain('src/components/students/StudentIdentityLine.tsx');
  });

  it('keeps the student and parent zones exempt, which is the privacy line', () => {
    // A ring can never render there, because no provider is mounted. If these
    // ever leave the allowlist, the rule starts demanding a swap that would
    // either do nothing or, worse, be "fixed" by mounting the provider and
    // showing thirty classmates who had paused.
    const globs = (readConfig().overrides || [])
      .filter((o) => o.rules && o.rules['no-restricted-syntax'] === 'off')
      .flatMap((o) => o.files);
    expect(globs).toContain('src/app/(student)/**');
    expect(globs).toContain('src/app/(parent)/**');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isE2ETestRun } from './e2e-mode';

const FLAGS = ['E2E_TEST_MODE', 'NEXT_PUBLIC_E2E_TEST_MODE'] as const;

function clearFlags() {
  for (const flag of FLAGS) delete process.env[flag];
}

describe('isE2ETestRun', () => {
  beforeEach(clearFlags);
  afterEach(clearFlags);

  it('is false on an ordinary server, so real visitor conversations still get logged', () => {
    expect(isE2ETestRun()).toBe(false);
  });

  it.each(FLAGS)('is true when %s is set to "true"', (flag) => {
    process.env[flag] = 'true';
    expect(isE2ETestRun()).toBe(true);
  });

  it('accepts only the exact string "true", so a stray value cannot mute logging', () => {
    for (const value of ['false', '1', 'yes', 'TRUE', '']) {
      process.env.E2E_TEST_MODE = value;
      expect(isE2ETestRun()).toBe(false);
    }
  });

  it('reads the environment on every call, not once at import', () => {
    expect(isE2ETestRun()).toBe(false);
    process.env.E2E_TEST_MODE = 'true';
    // A module-scope snapshot would still say false here. The flag is set while
    // the server boots, which is after this module is first imported.
    expect(isE2ETestRun()).toBe(true);
  });
});

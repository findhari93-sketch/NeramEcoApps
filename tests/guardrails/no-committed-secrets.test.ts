// Runs in the default jsdom environment: the global setupFile (tests/setup.ts)
// touches `window`, so this cannot opt into the node environment. Node's
// child_process is available either way.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Guardrail for a credential that reaches the public internet.
 *
 * `findhari93-sketch/NeramEcoApps` is a PUBLIC repository. Anything literal in
 * a tracked file is published the moment it is pushed, and stays readable in
 * the history afterwards even if the next commit removes it.
 *
 * That happened, five times over, and none of it was noticed for months:
 *
 *   - `.claude/mcp.json` and `.mcp.json` both carried the same Supabase
 *     personal access token (`sbp_`), which is account-wide admin over BOTH
 *     the production and staging projects.
 *   - `scripts/apply-migrations.mjs`, `scripts/apply-specific-migrations.mjs`
 *     and `scripts/setup-storage.mjs` carried a second, different `sbp_` token.
 *   - `scripts/seed-coa-rest.mjs` carried the `service_role` JWT for staging
 *     AND for production. A service_role key bypasses every RLS policy, so it
 *     is unrestricted read and write over every table in both databases.
 *
 * The Cloudflare token leaked the same way and was auto-revoked by GitHub
 * secret scanning, which is the only reason anyone found out. Scanning does not
 * catch every shape, so it is not a safety net worth relying on.
 *
 * Credentials belong in the environment. `${VAR}` in an MCP config,
 * `process.env.X` in a script, GitHub repo Secrets in a workflow.
 *
 * If this test fails: do NOT add your file to ALLOWED. Move the value into the
 * environment, then rotate the leaked credential, because it is already public.
 */

const REPO_ROOT = resolve(__dirname, '../..');

/**
 * Each pattern matches a credential shape that grants real access. Prefixes are
 * deliberate: they are what the issuing service actually emits, so a match is a
 * live credential rather than a lookalike.
 */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: string }> = [
  { name: 'Supabase personal access token', pattern: 'sbp_[a-zA-Z0-9]{30,}' },
  { name: 'GitHub personal access token', pattern: 'gh[pousr]_[A-Za-z0-9]{30,}' },
  { name: 'GitHub fine-grained token', pattern: 'github_pat_[A-Za-z0-9_]{50,}' },
  { name: 'Google / Firebase API key', pattern: 'AIza[0-9A-Za-z_-]{33,}' },
  { name: 'OpenAI / Anthropic style key', pattern: 'sk-[A-Za-z0-9_-]{30,}' },
  { name: 'Slack token', pattern: 'xox[baprs]-[A-Za-z0-9-]{20,}' },
  { name: 'Resend API key', pattern: 're_[A-Za-z0-9]{25,}' },
  { name: 'Razorpay live key', pattern: 'rzp_live_[A-Za-z0-9]{10,}' },
  { name: 'JWT (Supabase anon / service_role)', pattern: 'eyJhbGciOi[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{30,}' },
];

/**
 * `tests/utils/supabase.ts` holds the two keys Supabase ships with every local
 * stack. They are issued by `supabase-demo`, are identical on every developer's
 * machine, are printed by `supabase start`, and reach nothing that is not
 * already running on localhost. They are documentation, not a credential.
 */
const ALLOWED = new Set<string>(['tests/utils/supabase.ts']);

/** Tracked files only. An untracked scratch file is not published. */
const grepTracked = (pattern: string): string[] => {
  try {
    const out = execFileSync('git', ['grep', '-lE', pattern], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    // `git grep` exits 1 with no output when nothing matches, which is the
    // passing case. Any other failure is a real problem and must not read as a
    // clean scan.
    const { status, stdout } = error as { status?: number; stdout?: string };
    if (status === 1 && !stdout?.trim()) return [];
    throw error;
  }
};

describe('no committed secrets', () => {
  it.each(SECRET_PATTERNS)('has no committed $name', ({ pattern }) => {
    const offenders = grepTracked(pattern).filter((f) => !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  it('keeps the allowlist honest', () => {
    // An allowlisted file that no longer matches anything means the entry is
    // stale and should go, so the list cannot quietly grow into a blanket.
    const matched = new Set(SECRET_PATTERNS.flatMap(({ pattern }) => grepTracked(pattern)));
    const stale = [...ALLOWED].filter((f) => !matched.has(f));
    expect(stale).toEqual([]);
  });
});

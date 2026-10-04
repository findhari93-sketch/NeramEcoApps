// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * Guardrail for server fetches that quietly fill the Next.js Data Cache.
 *
 * In Next 14.2, a route handler that exports only GET starts with
 * `staticGenerationStore.revalidate = false`, even under
 * `dynamic = 'force-dynamic'` (that only sets forceDynamic). Any server
 * `fetch()` in that request with no `cache` or `next` option, and no
 * `fetchCache` segment config, then takes the "auto cache" branch of
 * patch-fetch.js with revalidate=false and is written to the Data Cache.
 * The method and an Authorization header do not save it: "auto no cache" only
 * applies once revalidate is already 0.
 *
 * Vercel bills every one of those writes as an ISR Write. Graph `/me` on every
 * new Microsoft token, Graph app tokens, SharePoint lookups and webhook posts
 * were all landing there (745K ISR writes in the Sep 2026 bill). They also
 * risked serving a cached Graph answer to a later request.
 *
 * So every fetch in server code states its cache intent: `cache: 'no-store'`
 * for live calls, or `next: { revalidate }` / `cache: 'force-cache'` where a
 * shared cached answer is genuinely wanted (marketing ISR reads). The option
 * must be written in the call itself, in an object literal, so a reader and
 * this scan can both see it.
 *
 * If this test fails: add `cache: 'no-store'` to the listed call. Only add a
 * file to BROWSER_ONLY if it never runs on the server.
 */

const REPO_ROOT = resolve(__dirname, '../..');

const SCAN_ROOTS = [
  'apps/admin/src',
  'apps/app/src',
  'apps/marketing/src',
  'apps/nexus/src',
  'packages/ai/src',
  'packages/auth/src',
  'packages/database/src',
  'packages/geo/src',
  'packages/i18n/src',
  'packages/ui/src',
];

/**
 * Modules without a 'use client' directive that only ever run in the browser
 * (they are imported by client components only). A browser fetch never touches
 * the Next.js Data Cache, and forcing no-store there would defeat HTTP caching
 * of our own API responses.
 */
const BROWSER_ONLY = new Set<string>([
  'apps/app/src/lib/funnel-tracker.ts',
  'apps/marketing/src/lib/funnel-tracker.ts',
  'apps/nexus/src/components/inspiration/inspiration-api.ts',
  'apps/nexus/src/components/sketchbook/sketchbook-api.ts',
  'apps/nexus/src/components/study-materials/recordings/recordings-api.ts',
  'apps/nexus/src/lib/upload-base64-images.ts',
  // callMsGraph uses the MSAL browser token cache (getAccessToken).
  'packages/auth/src/microsoft.ts',
]);

/**
 * Server files that still need the fix but are mid-edit in another working
 * session (the uncommitted apps/app tools redesign). Remove each entry when
 * its calls get `cache: 'no-store'`; the stale check below forces that.
 */
const PENDING = new Set<string>([
  'apps/app/src/lib/youtube.ts',
  'apps/app/src/app/api/cron/indexnow/route.ts',
]);

/** Callees treated as the global fetch: `fetch`, and injected `fetchImpl` / `doFetch` that default to it. */
const FETCH_NAMES = new Set(['fetch', 'fetchImpl', 'doFetch']);

const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '__integration__', '__mocks__', 'dist']);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

function isUseClient(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === 'use client') return true;
      continue; // other directives, e.g. 'use strict'
    }
    return false;
  }
  return false;
}

/** `fetch(...)`, `fetchImpl(...)`, `(deps.fetchImpl ?? fetch)(...)`. */
function isFetchCall(call: ts.CallExpression): boolean {
  let callee: ts.Expression = call.expression;
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (ts.isIdentifier(callee)) return FETCH_NAMES.has(callee.text);
  if (ts.isBinaryExpression(callee) && callee.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const right = callee.right;
    return ts.isIdentifier(right) && right.text === 'fetch';
  }
  return false;
}

/** True when the init argument is an object literal naming `cache` or `next`. */
function statesCacheIntent(call: ts.CallExpression): boolean {
  let init: ts.Expression | undefined = call.arguments[1];
  // `{ ... } as RequestInit`, `({ ... })`, `{ ... } satisfies RequestInit`
  while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init) || ts.isSatisfiesExpression(init) || ts.isTypeAssertionExpression(init))) {
    init = init.expression;
  }
  if (!init || !ts.isObjectLiteralExpression(init)) return false;
  return init.properties.some((p) => {
    const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
    return name === 'cache' || name === 'next';
  });
}

function findUncachedFetches(src: string, fileName: string): number[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (isUseClient(sf)) return [];
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isFetchCall(node) && !statesCacheIntent(node)) {
      lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

function scan(): Map<string, number[]> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const hits = new Map<string, number[]>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/\b(fetch|fetchImpl|doFetch)\b/.test(src)) continue;
    const lines = findUncachedFetches(src, file);
    if (lines.length) hits.set(relative(REPO_ROOT, file).replace(/\\/g, '/'), lines);
  }
  return hits;
}

describe('server fetches state their cache intent', () => {
  let cached: Map<string, number[]> | null = null;
  const getHits = () => (cached ??= scan());

  it('has no server fetch without cache or next option', () => {
    const offenders = [...getHits().entries()]
      .filter(([file]) => !BROWSER_ONLY.has(file) && !PENDING.has(file))
      .flatMap(([file, lines]) => lines.map((line) => `${file}:${line}`));
    expect(offenders).toEqual([]);
  }, 60_000);

  it('keeps the allowlists honest', () => {
    // An allowlisted file with nothing left to excuse should leave the list.
    const stale = [...BROWSER_ONLY, ...PENDING].filter((file) => !getHits().has(file));
    expect(stale).toEqual([]);
  }, 60_000);
});

describe('findUncachedFetches', () => {
  it('flags a bare fetch and a fetch whose init has no cache option', () => {
    const src = [
      "const a = await fetch('https://graph.microsoft.com/v1.0/me');",
      "const b = await fetch(url, { headers: { Authorization: 'x' } });",
    ].join('\n');
    expect(findUncachedFetches(src, 'x.ts')).toEqual([1, 2]);
  });

  it('accepts cache: no-store and next.revalidate', () => {
    const src = [
      "await fetch(url, { cache: 'no-store', headers });",
      'await fetch(url, { next: { revalidate: 60 } });',
      'await fetch(url, { ...options, next: { revalidate: 60 } } as RequestInit);',
    ].join('\n');
    expect(findUncachedFetches(src, 'x.ts')).toEqual([]);
  });

  it('does not trust an init passed by variable or spread alone', () => {
    const src = ['await fetch(input, base);', 'await fetch(input, { ...base, signal });'].join('\n');
    expect(findUncachedFetches(src, 'x.ts')).toEqual([1, 2]);
  });

  it('catches injected fetch implementations', () => {
    // No top-level await before the parenthesised callee: in a script that
    // parses as a call to an identifier named `await`.
    const src = ['fetchImpl(url, { method: "POST" });', 'const r = (deps.fetchImpl ?? fetch)(url, { method: "POST" });'].join('\n');
    expect(findUncachedFetches(src, 'x.ts')).toEqual([1, 2]);
  });

  it('is not fooled by regex literals holding quotes', () => {
    const src = "await fetch(`${base}?$filter=name eq '${n.replace(/'/g, \"''\")}'`, { headers });";
    expect(findUncachedFetches(src, 'x.ts')).toEqual([1]);
  });

  it('skips use client modules and member calls such as res.fetch or window.fetch', () => {
    expect(findUncachedFetches("'use client';\nawait fetch('/api/x');", 'x.tsx')).toEqual([]);
    expect(findUncachedFetches("await window.fetch('/api/x');\nawait client.fetch(q);", 'x.ts')).toEqual([]);
  });
});

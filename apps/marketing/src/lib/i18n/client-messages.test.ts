// @vitest-environment node
/**
 * Guards the trimmed NextIntlClientProvider messages.
 *
 * For every route entry (page/layout/... under src/app) it follows local imports
 * (static and dynamic), collects what each client component asks of
 * useTranslations, and checks the messages that reach it: the page's
 * <ClientIntl namespaces={[...]}> list when it has one, otherwise the layout's
 * LAYOUT_CLIENT_MESSAGES. A missing namespace would render raw keys in the
 * browser, so it fails here instead.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { LAYOUT_CLIENT_MESSAGES, pickMessages } from './client-messages';
import en from '../../../messages/en.json';

const SRC = path.resolve(__dirname, '../..');
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const ext of ['', ...EXTS]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile() && /\.(tsx?|json)$/.test(p)) return p;
  }
  return null;
}

interface FileInfo {
  imports: string[];
  /** 'ns' (whole namespace needed) or 'ns.key' (only that first-level key). */
  needs: Set<string>;
}

const infoCache = new Map<string, FileInfo>();

function readInfo(file: string): FileInfo {
  const cached = infoCache.get(file);
  if (cached) return cached;
  const src = fs.readFileSync(file, 'utf8');
  const specs: string[] = [];
  for (const re of [/from\s+['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g, /import\s+['"]([^'"]+)['"]/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]);
  }
  const imports = specs
    .map((s) => resolveImport(file, s))
    .filter((p): p is string => !!p && !p.endsWith('.json'));

  const needs = new Set<string>();
  const hookRe = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:['"]([^'"]*)['"])?\s*\)/g;
  let h: RegExpExecArray | null;
  let hooks = 0;
  while ((h = hookRe.exec(src))) {
    hooks += 1;
    const [, name, ns] = h;
    const callRe = new RegExp(`\\b${name}(?:\\.(?:rich|raw|markup|has))?\\(\\s*(['"\`])([^'"\`]*)`, 'g');
    // A call whose key is not a string literal, e.g. t(key) or t(item.label).
    // (A t handed to a helper in the same file is fine: its calls are scanned too.)
    const varCall = new RegExp(`\\b${name}(?:\\.(?:rich|raw|markup|has))?\\(\\s*[^'"\`\\s)]`);
    const staticCalls: string[] = [];
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(src))) staticCalls.push(c[2]);
    const opaque = varCall.test(src);

    if (!ns) {
      // Root hook: every key names its namespace first.
      for (const key of staticCalls) {
        const first = key.split('.')[0];
        expect(first.includes('${'), `${file}: dynamic namespace in ${name}(\`${key}\`)`).toBe(false);
        needs.add(first);
      }
      expect(opaque, `${file}: root useTranslations() result used dynamically`).toBe(false);
      continue;
    }
    const nsRoot = ns.split('.')[0];
    const nsKey = ns.includes('.') ? ns.split('.')[1] : null;
    if (nsKey) {
      needs.add(`${nsRoot}.${nsKey}`);
    } else if (opaque || staticCalls.length === 0 || staticCalls.some((k) => k.split('.')[0].includes('${'))) {
      needs.add(nsRoot);
    } else {
      for (const key of staticCalls) needs.add(`${nsRoot}.${key.split('.')[0]}`);
    }
  }
  // A hook not assigned to a const (e.g. inline) cannot be traced: require the call to be named.
  const allHooks = (src.match(/\buseTranslations\(/g) || []).length;
  expect(allHooks, `${file}: every useTranslations() call must be assigned to a const`).toBe(hooks);
  if (/\buseMessages\(\)/.test(src)) needs.add('*');

  const info = { imports, needs };
  infoCache.set(file, info);
  return info;
}

function closureNeeds(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  const needs = new Set<string>();
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const info = readInfo(file);
    info.needs.forEach((n) => needs.add(n));
    stack.push(...info.imports);
  }
  return needs;
}

function covered(need: string, list: readonly string[]): boolean {
  if (need === '*') return false;
  const ns = need.split('.')[0];
  return list.includes(ns) || list.includes(need);
}

function routeEntries(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeEntries(p, out);
    else if (/^(page|layout|not-found|error|template|loading|default)\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function declaredClientIntl(file: string): string[] | null {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/<ClientIntl[^>]*namespaces=\{\[([^\]]*)\]\}/);
  if (!m) return null;
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

const enMessages = en as unknown as Record<string, Record<string, unknown>>;
const existsInEn = (entry: string) => {
  const [ns, key] = entry.split('.', 2);
  return key ? enMessages[ns] != null && (enMessages[ns] as Record<string, unknown>)[key] !== undefined : enMessages[ns] !== undefined;
};

describe('client translation messages', () => {
  const entries = routeEntries(path.join(SRC, 'app'));

  it('finds the route entries', () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it('the layout passes everything the site chrome translates', () => {
    const layout = path.join(SRC, 'app', '[locale]', 'layout.tsx');
    const missing = [...closureNeeds(layout)].filter((n) => !covered(n, LAYOUT_CLIENT_MESSAGES));
    expect(missing).toEqual([]);
    const src = fs.readFileSync(layout, 'utf8');
    expect(src).toMatch(/const messages = pickMessages\([^;]*,\s*LAYOUT_CLIENT_MESSAGES\s*\);/);
    expect(src).toMatch(/<NextIntlClientProvider messages=\{messages\}>/);
  });

  it('every page passes the namespaces its client components use', () => {
    const problems: string[] = [];
    for (const entry of entries) {
      const needs = [...closureNeeds(entry)];
      if (needs.length === 0) continue;
      const declared = declaredClientIntl(entry);
      const list = declared ?? [...LAYOUT_CLIENT_MESSAGES];
      const missing = needs.filter((n) => !covered(n, list));
      if (missing.length) problems.push(`${path.relative(SRC, entry)}: missing ${missing.join(', ')} (passes ${list.join(', ')})`);
    }
    expect(problems).toEqual([]);
  });

  it('every listed namespace exists in messages/en.json', () => {
    const bad: string[] = [];
    for (const e of LAYOUT_CLIENT_MESSAGES) if (!existsInEn(e)) bad.push(`layout: ${e}`);
    for (const entry of entries) {
      for (const e of declaredClientIntl(entry) ?? []) if (!existsInEn(e)) bad.push(`${path.relative(SRC, entry)}: ${e}`);
    }
    expect(bad).toEqual([]);
  });

  it('the layout ships a small fraction of the message file', () => {
    const picked = JSON.stringify(pickMessages(en as never, LAYOUT_CLIENT_MESSAGES)).length;
    const full = JSON.stringify(enMessages).length;
    expect(picked).toBeLessThan(full * 0.1);
  });
});

describe('pickMessages', () => {
  const messages = { a: { x: '1', y: '2' }, b: { z: '3' }, c: 'flat' };

  it('picks whole namespaces and single keys', () => {
    expect(pickMessages(messages, ['b', 'a.x'])).toEqual({ b: { z: '3' }, a: { x: '1' } });
  });

  it('merges several keys of one namespace and lets a whole namespace win', () => {
    expect(pickMessages(messages, ['a.x', 'a.y'])).toEqual({ a: { x: '1', y: '2' } });
    expect(pickMessages(messages, ['a', 'a.x'])).toEqual({ a: { x: '1', y: '2' } });
  });

  it('skips missing entries', () => {
    expect(pickMessages(messages, ['nope', 'a.nope', 'c.k'])).toEqual({});
  });
});

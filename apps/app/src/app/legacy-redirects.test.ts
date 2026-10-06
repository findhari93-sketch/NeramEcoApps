// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allToolSeo } from '@/lib/tools/tool-seo';

const legacyRedirects: { source: string; destination: string; permanent: boolean }[] = require('../../legacy-redirects');

const APP_DIR = resolve(__dirname);

/** True when a static page.tsx serves this path, looking through (group) folders. */
function pageExists(path: string, dir = APP_DIR): boolean {
  const [head, ...rest] = path.split('/').filter(Boolean);
  if (!head) return existsSync(join(dir, 'page.tsx'));
  const groups = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\(.+\)$/.test(d.name));
  if (existsSync(join(dir, head)) && pageExists(rest.join('/'), join(dir, head))) return true;
  return groups.some((g) => pageExists(path, join(dir, g.name)));
}

describe('legacy tool URLs', () => {
  it('are permanent and point straight at a page that exists (no chains)', () => {
    const sources = new Set(legacyRedirects.map((r) => r.source));
    for (const r of legacyRedirects) {
      expect(r.permanent, r.source).toBe(true);
      expect(sources.has(r.destination), `${r.source} chains into another redirect`).toBe(false);
      expect(pageExists(r.destination), `${r.destination} has no page`).toBe(true);
    }
  });

  it('never shadow a live page and never return to the sitemap', () => {
    const toolPaths = new Set(allToolSeo().map((t) => t.path));
    for (const r of legacyRedirects) {
      expect(pageExists(r.source), `${r.source} has a page, the redirect would hide it`).toBe(false);
      expect(toolPaths.has(r.source), `${r.source} is listed as a tool page`).toBe(false);
    }
  });
});

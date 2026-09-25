import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PUBLIC_CACHE_HEADERS } from './public-cache';

describe('PUBLIC_CACHE_HEADERS', () => {
  it('opts into Vercel edge caching, which the /api no-store rule otherwise blocks', () => {
    expect(PUBLIC_CACHE_HEADERS['Vercel-CDN-Cache-Control']).toMatch(/s-maxage=\d+/);
    expect(PUBLIC_CACHE_HEADERS['Cache-Control']).toMatch(/^public/);
  });

  it('is only used by routes that never read auth', () => {
    const apiDir = path.resolve(__dirname, '..');
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'route.ts') {
          const src = fs.readFileSync(p, 'utf8');
          if (src.includes('PUBLIC_CACHE_HEADERS')) {
            users.push(p);
            expect(src, p).not.toMatch(/verifyFirebaseToken|Authorization|cookies\(|getRequestUser/);
          }
        }
      }
    };
    walk(apiDir);
    expect(users.length).toBeGreaterThan(0);
  });
});

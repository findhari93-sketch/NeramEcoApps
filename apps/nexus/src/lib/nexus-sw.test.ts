/**
 * public/nexus-sw.js, the worker that shows /offline instead of Android's
 * "Can't connect to the site" box. It is a plain script with no build step, so
 * the shipped file itself is loaded here into a sandbox with a fake network and
 * a fake Cache Storage.
 *
 * The rule that matters most: while the network works, it changes nothing.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import { describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../../public/nexus-sw.js'), 'utf8');
const ORIGIN = 'https://nexus.neramclasses.com';

const OFFLINE_HTML =
  '<html><head><link rel="stylesheet" href="/_next/static/css/app.css"/></head>' +
  '<body><script src="/_next/static/chunks/main-app.js" async=""></script>' +
  '<script src="/_next/static/chunks/main-app.js"></script>' +
  '<script src="https://cdn.example/x.js"></script></body></html>';

type Listener = (event: any) => void;

function load(opts: { network: 'up' | 'down' }) {
  const store = new Map<string, Response>();
  const listeners: Record<string, Listener> = {};
  const fetched: string[] = [];

  const cache = {
    put: async (req: string | { url: string }, res: Response) => {
      store.set(new URL(typeof req === 'string' ? req : req.url, ORIGIN).pathname, res);
    },
    match: async (req: string) => store.get(new URL(req, ORIGIN).pathname)?.clone(),
    keys: async () => [...store.keys()].map((p) => ({ url: ORIGIN + p })),
    delete: async (req: { url: string }) => store.delete(new URL(req.url).pathname),
  };

  const fetchImpl = vi.fn(async (input: string | { url: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    fetched.push(url);
    if (opts.network === 'down') throw new TypeError('Failed to fetch');
    const path = new URL(url, ORIGIN).pathname;
    if (path === '/offline') return new Response(OFFLINE_HTML, { status: 200 });
    return new Response(`body of ${path}`, { status: 200 });
  });

  const self: any = {
    location: { origin: ORIGIN },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
  };

  runInNewContext(SOURCE, {
    self,
    fetch: fetchImpl,
    caches: { open: async () => cache, match: async (req: string) => cache.match(req) },
    Response,
    URL,
    Promise,
  });

  async function dispatch(type: string, data: Record<string, unknown>) {
    let waited: Promise<unknown> = Promise.resolve();
    let responded: Response | Promise<Response> | null = null;
    listeners[type]({
      ...data,
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    await waited;
    return responded as Response | null;
  }

  return { store, fetched, fetchImpl, dispatch, setNetwork: (n: 'up' | 'down') => (opts.network = n) };
}

function request(path: string, init: { mode?: string; method?: string } = {}) {
  return { url: ORIGIN + path, mode: init.mode ?? 'cors', method: init.method ?? 'GET' };
}

describe('nexus-sw.js install', () => {
  it('saves /offline and only its own same-origin script and style files, once each', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('install', {});

    expect([...sw.store.keys()].sort()).toEqual(
      ['/__nexus-offline-build', '/_next/static/chunks/main-app.js', '/_next/static/css/app.css', '/offline'].sort(),
    );
    expect(sw.fetched.filter((u) => u.endsWith('main-app.js'))).toHaveLength(1);
    expect(sw.fetched.some((u) => u.includes('cdn.example'))).toBe(false);
  });

  it('installs even with no network, so a later message can save the page', async () => {
    const sw = load({ network: 'down' });
    await expect(sw.dispatch('install', {})).resolves.toBeNull();
    expect(sw.store.size).toBe(0);
  });
});

describe('nexus-sw.js fetch', () => {
  it('changes nothing while the network works', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('install', {});

    const page = await sw.dispatch('fetch', { request: request('/student/dashboard', { mode: 'navigate' }) });
    expect(await page!.text()).toBe('body of /student/dashboard');

    const chunk = await sw.dispatch('fetch', { request: request('/_next/static/chunks/main-app.js') });
    expect(await chunk!.text()).toBe('body of /_next/static/chunks/main-app.js');
  });

  it('never touches API calls, other methods or other sites', async () => {
    const sw = load({ network: 'down' });
    expect(await sw.dispatch('fetch', { request: request('/api/help', { method: 'POST' }) })).toBeNull();
    expect(await sw.dispatch('fetch', { request: request('/api/auth/me') })).toBeNull();
    expect(await sw.dispatch('fetch', { request: { url: 'https://login.microsoftonline.com/x', mode: 'navigate', method: 'GET' } })).toBeNull();
  });

  it('shows the saved /offline page when a page cannot load, and serves its files', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('install', {});
    sw.setNetwork('down');

    const page = await sw.dispatch('fetch', { request: request('/student/dashboard', { mode: 'navigate' }) });
    expect(await page!.text()).toBe(OFFLINE_HTML);

    const chunk = await sw.dispatch('fetch', { request: request('/_next/static/chunks/main-app.js') });
    expect(await chunk!.text()).toBe('body of /_next/static/chunks/main-app.js');
  });

  it('fails a file it never saved, rather than inventing one', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('install', {});
    sw.setNetwork('down');
    const other = await sw.dispatch('fetch', { request: request('/_next/static/chunks/other.js') });
    expect(other!.type).toBe('error');
  });
});

describe('nexus-sw.js build message', () => {
  it('refreshes the saved page for a new build, and not again for the same one', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('install', {});
    const before = sw.fetchImpl.mock.calls.length;

    await sw.dispatch('message', { data: { type: 'nexus-build', build: 'b2' } });
    const afterNew = sw.fetchImpl.mock.calls.length;
    expect(afterNew).toBeGreaterThan(before);
    expect(await sw.store.get('/__nexus-offline-build')!.clone().text()).toBe('b2');

    await sw.dispatch('message', { data: { type: 'nexus-build', build: 'b2' } });
    expect(sw.fetchImpl.mock.calls.length).toBe(afterNew);
  });

  it('ignores anything that is not a build message', async () => {
    const sw = load({ network: 'up' });
    await sw.dispatch('message', { data: { type: 'something-else' } });
    expect(sw.fetchImpl).not.toHaveBeenCalled();
  });
});

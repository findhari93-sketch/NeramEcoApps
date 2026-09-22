import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * A returning teacher's hard load must hydrate cleanly.
 *
 * The server has no localStorage, so it renders the signed-out, still-loading
 * shell: RoleGuard's full-screen spinner. The browser holds yesterday's
 * /api/auth/me answer (lib/auth-cache.ts) and used to read it inside useState
 * initialisers, so its FIRST render drew the signed-in page instead. Two
 * different trees: React #418 (hydration failed) and, because no Suspense
 * boundary sits above the shell, #423 (the whole root thrown away and rendered
 * again on the client, every provider and effect with it). Production showed
 * both on every Nexus page for anyone with a warm cache.
 *
 * The cached shell must still appear without waiting for the network, just
 * after hydration instead of during it.
 */

vi.mock('@neram/auth', () => ({
  // MSAL has not settled yet on either side: its import and init are async.
  useMicrosoftAuth: () => ({ user: null, loading: true, signIn: vi.fn(), signOut: vi.fn() }),
  getAccessToken: vi.fn(async () => null),
  getAccessTokenSilent: vi.fn(async () => null),
  loginScopes: { nexus: [], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teacher/question-bank/papers/p1',
}));

import { NexusAuthProvider } from './useNexusAuth';
import RoleGuard from '@/components/RoleGuard';
import { writeCachedAuth } from '@/lib/auth-cache';

const CACHED_ME = {
  user: { id: 'u1', name: 'Hari', email: 'hari@example.com' },
  nexusRole: 'teacher',
  classrooms: [{ id: 'c1', name: 'NATA 2027' }],
  staffRole: 'admin',
  canTeach: true,
};

const tree = (
  <NexusAuthProvider>
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <main>PAPER PAGE</main>
    </RoleGuard>
  </NexusAuthProvider>
);

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  localStorage.clear();
});

describe('NexusAuthProvider hydration with a cached /api/auth/me answer', () => {
  it('hydrates without a mismatch, then paints the cached shell without the network', async () => {
    // The server's view: no device storage at all.
    container.innerHTML = renderToString(tree);
    expect(container.textContent).toContain('Loading...');

    // The browser's view: yesterday's answer is on the device.
    writeCachedAuth('oid-1', CACHED_ME);
    const recoverable: string[] = [];
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: (error) => recoverable.push(String((error as Error)?.message ?? error)),
      });
    });

    expect(recoverable).toEqual([]);
    expect(container.textContent).toContain('PAPER PAGE');
  });

  it('still shows the spinner, not a blank page, when nothing is cached', async () => {
    container.innerHTML = renderToString(tree);
    const recoverable: string[] = [];
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: (error) => recoverable.push(String((error as Error)?.message ?? error)),
      });
    });
    expect(recoverable).toEqual([]);
    expect(container.textContent).toContain('Loading...');
  });
});

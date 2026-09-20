import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig, type Cache } from 'swr';
import type { InspirationRow } from '@neram/database/queries/nexus';
import { presentRow } from '@/lib/inspiration-present';
import { makeRow } from '@/lib/inspiration-test-rows';

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 'token' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import InspirationBrowser from './InspirationBrowser';

const PAGE = 30;
const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

/**
 * One server for the whole file: a set of saves that both the search route and
 * the save route read, which is the only way a test can tell "the list asked
 * again" from "the list replayed what it had".
 */
const saves = new Set<string>();
let rows: InspirationRow[] = [];
let searchCalls = 0;

function searchAnswer(url: string) {
  const params = new URL(url, 'http://localhost').searchParams;
  const savedOnly = params.get('saved') === '1';
  const offset = Number(params.get('offset') ?? 0);
  const matching = rows.filter((r) => !savedOnly || saves.has(r.id));
  const page = matching.slice(offset, offset + PAGE);
  return {
    items: page.map((r) => presentRow({ ...r, is_saved: saves.has(r.id) }, { staff: false })),
    total: matching.length,
    matchKind: 'browse',
    facets: savedOnly || offset > 0 ? null : [],
    hasMore: offset + page.length < matching.length,
  };
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init: { method?: string } = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      const save = /\/api\/inspiration\/items\/([^/]+)\/save$/.exec(url);
      let body: unknown = {};
      if (save) {
        if (method === 'POST') saves.add(save[1]);
        else saves.delete(save[1]);
        body = { saved: method === 'POST' };
      } else if (url.startsWith('/api/inspiration/search')) {
        searchCalls += 1;
        body = searchAnswer(url);
      }
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }),
  );
}

/** The app's cache outlives any unmount (see lib/swr-cache.ts), so the test's does too. */
let cache: Map<string, unknown>;

function renderBrowser(savedOnly = false) {
  return render(
    <SWRConfig
      value={{
        provider: () => cache as unknown as Cache<unknown>,
        revalidateOnFocus: false,
        dedupingInterval: 15_000,
      }}
    >
      <InspirationBrowser mode="student" savedOnly={savedOnly} />
    </SWRConfig>,
  );
}

const heartName = (title: string, saved: boolean) => (saved ? `Remove ${title} from saved` : `Save ${title}`);
const heart = (title: string, saved: boolean) => screen.findByRole('button', { name: heartName(title, saved) });

/**
 * Let anything the mount started finish. A list that paints the right heart from
 * cache and then overwrites it a tick later is the bug, not a pass, so every
 * assertion about a reopened list is made after this.
 */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe('InspirationBrowser saving', () => {
  beforeEach(() => {
    saves.clear();
    searchCalls = 0;
    cache = new Map();
    rows = [
      makeRow({ id: uuid(1), title_override: 'Alpha', source_created_at: '2026-09-03T10:00:00Z' }),
      makeRow({ id: uuid(2), title_override: 'Beta', source_created_at: '2026-09-02T10:00:00Z' }),
    ];
    stubFetch();
  });

  it('shows a drawing on the Saved list that was open before the heart was tapped', async () => {
    // The student looks at Saved first, finds it empty, and goes back to browse.
    const empty = renderBrowser(true);
    expect((await screen.findAllByText('Nothing saved yet')).length).toBeGreaterThan(0);
    empty.unmount();

    const grid = renderBrowser();
    fireEvent.click(await heart('Alpha', false));
    await waitFor(() => expect(saves.has(uuid(1))).toBe(true));
    grid.unmount();

    renderBrowser(true);
    expect(await heart('Alpha', true)).toBeTruthy();
  });

  it('keeps the heart filled when the grid is opened again', async () => {
    const grid = renderBrowser();
    fireEvent.click(await heart('Alpha', false));
    await waitFor(() => expect(saves.has(uuid(1))).toBe(true));
    grid.unmount();

    renderBrowser();
    await heart('Beta', false);
    await settle();
    expect(screen.getByRole('button', { name: heartName('Alpha', true) })).toBeTruthy();
  });

  it('keeps the heart filled on a drawing from the second page', async () => {
    rows = Array.from({ length: PAGE + 2 }, (_, i) =>
      makeRow({ id: uuid(i + 1), title_override: `Drawing ${i + 1}`, source_created_at: `2026-09-03T10:00:0${i % 10}Z` }),
    );
    const grid = renderBrowser();
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    fireEvent.click(await heart(`Drawing ${PAGE + 1}`, false));
    await waitFor(() => expect(saves.has(uuid(PAGE + 1))).toBe(true));
    grid.unmount();

    // The reopened list still holds both pages, so there is nothing to load again.
    const before = searchCalls;
    renderBrowser();
    await heart('Drawing 1', false);
    await settle();
    expect(screen.getByRole('button', { name: heartName(`Drawing ${PAGE + 1}`, true) })).toBeTruthy();
    // Reopening re-reads page 0 and nothing else: the pages the student already
    // loaded are only refetched when their cache entry disagrees with the list.
    expect(searchCalls - before).toBe(1);
  });
});

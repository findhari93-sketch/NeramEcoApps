import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, act, cleanup, waitFor } from '@testing-library/react';
import useSWR, { SWRConfig } from 'swr';
import { useRevalidateClass } from './nexus-swr';
import { STAGE_FACTS_KEY, useRefreshStudentStageFacts } from './stage-facts-cache';

/**
 * Refetching after a write, under the cache the app actually runs on.
 *
 * app/providers.tsx gives SWRConfig its own cache (the persistent device cache).
 * SWR's exported `mutate` is bound to SWR's built-in default cache, not to a
 * provider's, so calling it from inside that tree revalidates nothing: the
 * helpers that did so (a class's sections after a wrap-up, the stage facts after
 * a stage edit, "Who is coming" after a cancel) silently left the old answer on
 * screen. The mutate that reaches the provider's cache comes from useSWRConfig().
 */

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't' }) }));

afterEach(cleanup);

/** A tree like the app's: SWR under a custom cache provider. */
function withAppCache(children: React.ReactNode) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

function Reader({ swrKey, fetcher }: { swrKey: string; fetcher: (k: string) => Promise<unknown> }) {
  useSWR(swrKey, fetcher);
  return null;
}

describe('refetching after a write under the app cache provider', () => {
  it('useRevalidateClass refetches every read for that class, and only that class', async () => {
    const mine = vi.fn(async () => ({ ok: true }));
    const other = vi.fn(async () => ({ ok: true }));
    let revalidate!: (classId: string) => Promise<unknown>;
    function Saver() {
      revalidate = useRevalidateClass();
      return null;
    }
    render(
      withAppCache(
        <>
          <Reader swrKey="/api/timetable/c1/prep-roster" fetcher={mine} />
          <Reader swrKey="/api/timetable/c2/prep-roster" fetcher={other} />
          <Saver />
        </>,
      ),
    );
    await waitFor(() => expect(mine).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(other).toHaveBeenCalledTimes(1));

    await act(async () => {
      await revalidate('c1');
    });

    await waitFor(() => expect(mine).toHaveBeenCalledTimes(2));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('useRefreshStudentStageFacts refetches the stage facts lookup', async () => {
    const fetcher = vi.fn(async () => ({ facts: {} }));
    let refresh!: () => Promise<unknown>;
    function Saver() {
      refresh = useRefreshStudentStageFacts();
      return null;
    }
    render(withAppCache(<><Reader swrKey={STAGE_FACTS_KEY} fetcher={fetcher} /><Saver /></>));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    await act(async () => {
      await refresh();
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});

describe('no Nexus code calls the global mutate', () => {
  it('imports mutate from swr nowhere under src (use useSWRConfig().mutate)', () => {
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/import\s*(?:\w+\s*,\s*)?\{[^}]*\bmutate\b[^}]*\}\s*from\s*['"]swr['"]/.test(text)) {
            offenders.push(path.relative(root, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

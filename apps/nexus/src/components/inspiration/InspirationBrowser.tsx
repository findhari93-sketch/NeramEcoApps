'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { Alert, Box, Button, EmptyState, Typography } from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import type { InspirationFacet, InspirationMatchKind } from '@neram/database/queries/nexus';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { fetchWithToken } from '@/lib/nexus-swr';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import {
  EMPTY_QUERY,
  hasActiveFilters,
  parseInspirationQuery,
  toApiQuery,
  toQueryPatch,
  type InspirationQueryState,
} from '@/lib/inspiration-query';
import type { InspirationCard } from '@/lib/inspiration-present';
import AddExemplarSheet from './AddExemplarSheet';
import InspirationFilterChips from './InspirationFilterChips';
import InspirationMasonry from './InspirationMasonry';
import InspirationSearchBar from './InspirationSearchBar';
import InspirationTile from './InspirationTile';
import { patchItem, prepareImages, setSaved } from './inspiration-api';
import { inspirationBase, rememberListUrl, type InspirationMode } from './inspiration-nav';

const PAGE = 30;

interface SearchPage {
  items: InspirationCard[];
  total: number;
  matchKind: InspirationMatchKind | null;
  facets: InspirationFacet[] | null;
  hasMore: boolean;
}

export interface InspirationBrowserProps {
  mode: InspirationMode;
  savedOnly?: boolean;
}

/**
 * Search home and results on one page. The state lives in the URL (read after
 * mount, written with replaceState), so a search survives reload, sharing and
 * Back. Teachers get the same page with a Hidden filter and Add exemplar.
 */
export default function InspirationBrowser({ mode, savedOnly = false }: InspirationBrowserProps) {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  // Reaches a page's own cache entry, which the hook's own mutate cannot. See toggleSave.
  const { mutate: mutateKey } = useSWRConfig();
  const base = inspirationBase(mode);
  const sentinel = useRef<HTMLDivElement>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<InspirationQueryState>(EMPTY_QUERY);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<'visible' | 'hidden'>('visible');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const search = readSearch();
    const initial = parseInspirationQuery(search);
    setState(initial);
    setInput(initial.q);
    setScope(mode === 'staff' && new URLSearchParams(search).get('scope') === 'hidden' ? 'hidden' : 'visible');
    setReady(true);
  }, [mode]);

  // Typing settles for 400ms before it becomes a search.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      setState((s) => (s.q === input.trim() ? s : { ...s, q: input.trim() }));
    }, 400);
    return () => clearTimeout(timer);
  }, [input, ready]);

  useEffect(() => {
    if (!ready || savedOnly) return;
    patchQuery({ ...toQueryPatch(state), scope: scope === 'hidden' ? 'hidden' : null });
  }, [state, scope, ready, savedOnly]);

  const getKey = useCallback(
    (index: number, previous: SearchPage | null) => {
      if (!ready) return null;
      if (previous && !previous.hasMore) return null;
      const qs = toApiQuery(savedOnly ? EMPTY_QUERY : state, { offset: index * PAGE, scope, savedOnly });
      return `/api/inspiration/search${qs ? `?${qs}` : ''}`;
    },
    [ready, state, scope, savedOnly],
  );

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<SearchPage>(
    getKey,
    (url: string) => fetchWithToken<SearchPage>(url, getToken),
    {
      // A new search or filter changes page 0's key, so SWR starts again from one page.
      persistSize: false,
      // Which drawings are saved is the student's own state and it changes from
      // three places: this grid, the drawing's own page, and the Saved list. So
      // page 0 is re-read every time a list is opened (SWR's default), and the
      // app-wide 15s dedupe window is off here, because inside that window a
      // Saved list opened right after a heart was tapped is answered by the
      // request that ran before the tap. Pages past the first still come from
      // the cache, so reopening a deep list is one request, not one per page.
      dedupingInterval: 0,
    },
  );

  const cards = useMemo(() => (data ?? []).flatMap((page) => page.items), [data]);
  const first = data?.[0];
  const hasMore = Boolean(data?.[data.length - 1]?.hasMore);
  const loadingMore = isValidating && size > (data?.length ?? 0);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void setSize((s) => s + 1);
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, setSize, cards.length]);

  // Teachers: fill missing thumbnails a batch at a time while the page is open.
  useEffect(() => {
    if (mode !== 'staff') return;
    let cancelled = false;
    (async () => {
      let last = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 10 && !cancelled; i++) {
        try {
          const { processed, remaining } = await prepareImages(getToken);
          if (processed === 0 || remaining === 0 || remaining >= last) break;
          last = remaining;
        } catch {
          break;
        }
      }
      if (!cancelled) void mutate();
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, getToken, mutate]);

  const patchPage = useCallback(
    (page: SearchPage, id: string, saved: boolean): SearchPage => ({
      ...page,
      items:
        savedOnly && !saved
          ? page.items.filter((c) => c.id !== id)
          : page.items.map((c) => (c.id === id ? { ...c, saved } : c)),
    }),
    [savedOnly],
  );

  /**
   * Fill or empty the heart, then tell the server.
   *
   * The patch is written to each page's own cache entry as well as to the array
   * this hook renders. useSWRInfinite rebuilds that array from the page entries
   * on every read, so a heart written only to the array (all `mutate` can reach)
   * survives until the next read and then quietly un-fills itself.
   */
  const toggleSave = useCallback(
    async (card: InspirationCard) => {
      const next = !card.saved;
      const pages = data ?? [];
      const keys = pages.map((_, i) => getKey(i, i === 0 ? null : pages[i - 1]));
      const writePages = (list: SearchPage[]) =>
        Promise.all(keys.map((key, i) => (key ? mutateKey(key, list[i], { revalidate: false }) : null)));

      const patched = pages.map((page) => patchPage(page, card.id, next));
      await writePages(patched);
      await mutate(patched, { revalidate: false });
      try {
        await setSaved(getToken, card.id, next);
      } catch {
        // Put back what the server still believes, then go and ask it.
        await writePages(pages);
        await mutate();
      }
    },
    [data, getKey, getToken, mutate, mutateKey, patchPage],
  );

  /**
   * Take a drawing off the shelf, from the grid.
   *
   * The curation bar on the item page could already do this, which meant
   * noticing a drawing did not belong here, opening it, and then hiding it. A
   * teacher scanning the grid is exactly where that judgement gets made.
   *
   * Hiding is the gallery decision and nothing more. It does not touch the
   * Teams message that announced the work, because retracting praise in front
   * of a class is a different and much heavier act, and it stays on the sketch
   * screen where it is spelled out as un-featuring.
   */
  const hideCard = useCallback(
    async (card: InspirationCard) => {
      const pages = data ?? [];
      const keys = pages.map((_, i) => getKey(i, i === 0 ? null : pages[i - 1]));
      const write = (list: SearchPage[]) =>
        Promise.all(keys.map((key, i) => (key ? mutateKey(key, list[i], { revalidate: false }) : null)));

      const without = pages.map((page) => ({ ...page, items: page.items.filter((c) => c.id !== card.id) }));
      await write(without);
      await mutate(without, { revalidate: false });
      try {
        await patchItem(getToken, card.id, { curation: 'hidden' });
      } catch {
        await write(pages);
      }
      // Counts and facets moved, so read the truth back either way.
      await mutate();
    },
    [data, getKey, getToken, mutate, mutateKey],
  );

  const clearAll = () => {
    setInput('');
    setState(EMPTY_QUERY);
  };

  const filtered = hasActiveFilters(state) || scope === 'hidden';
  // Nothing on screen with a read in flight means "not known yet", not "nothing".
  // Otherwise the Saved list shows "Nothing saved yet" over the empty page it had
  // cached before the heart was tapped, while the answer carrying that drawing is
  // still on its way.
  const settling = cards.length === 0 && (isLoading || isValidating);
  const empty = ready && !error && !settling && cards.length === 0;

  // The one line a screen reader hears: the result count/fuzzy note when there are
  // cards, the empty-state title when there are none, or nothing while still loading.
  const resultLine =
    first && cards.length > 0 && !savedOnly
      ? first.matchKind === 'fuzzy'
        ? `Nothing matched "${state.q}" exactly. Here is what is close.`
        : first.matchKind === 'any'
          ? `No drawing has every word of "${state.q}". These match some of them.`
          : `${first.total} ${first.total === 1 ? 'drawing' : 'drawings'}`
      : null;
  const emptyTitle = savedOnly
    ? 'Nothing saved yet'
    : filtered
      ? state.q
        ? `Nothing found for "${state.q}"`
        : 'Nothing matches these filters'
      : 'No drawings yet';
  const statusMessage = resultLine ?? (empty ? emptyTitle : '');

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader
        title={savedOnly ? 'Saved' : 'Inspiration'}
        subtitle={
          savedOnly
            ? 'Drawings you kept for later'
            : mode === 'staff'
              ? 'What students see when they look for ideas'
              : 'Search drawings by Neram teachers, classmates and alumni'
        }
        backHref={savedOnly ? base : undefined}
        breadcrumbs={savedOnly ? [{ label: 'Inspiration', href: base }] : undefined}
        action={
          savedOnly ? undefined : mode === 'staff' ? (
            <Button variant="contained" startIcon={<AddPhotoAlternateOutlinedIcon />} onClick={() => setAdding(true)} sx={{ minHeight: 44 }}>
              Add exemplar
            </Button>
          ) : (
            <Button component={Link} href={`${base}/saved`} variant="outlined" startIcon={<FavoriteBorderIcon />} sx={{ minHeight: 44 }}>
              Saved
            </Button>
          )
        }
      />

      <Box sx={{ px: { xs: 2, sm: 3 }, maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
        {!savedOnly && (
          <>
            <InspirationSearchBar value={input} onChange={setInput} />
            <InspirationFilterChips
              state={state}
              facets={first?.facets ?? []}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
              scope={mode === 'staff' ? scope : undefined}
              onScopeChange={mode === 'staff' ? setScope : undefined}
            />
          </>
        )}

        <Typography
          component="p"
          role="status"
          aria-live="polite"
          variant="body2"
          color="text.secondary"
          sx={
            resultLine
              ? { mb: 1.5 }
              : {
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  padding: 0,
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }
          }
        >
          {statusMessage}
        </Typography>

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => mutate()} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            }
            sx={{ mb: 2 }}
          >
            Could not load drawings. Check your connection and try again.
          </Alert>
        )}

        {empty ? (
          savedOnly ? (
            <EmptyState
              icon={<FavoriteBorderIcon />}
              title="Nothing saved yet"
              description="Tap the heart on any drawing to keep it here."
              action={
                <Button component={Link} href={base} variant="contained" sx={{ minHeight: 48 }}>
                  Browse Inspiration
                </Button>
              }
            />
          ) : filtered ? (
            <EmptyState
              icon={<ImageSearchOutlinedIcon />}
              title={state.q ? `Nothing found for "${state.q}"` : 'Nothing matches these filters'}
              description="Try fewer words, or clear the filters."
              action={
                <Button variant="contained" onClick={clearAll} sx={{ minHeight: 48 }}>
                  Clear search and filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ImageSearchOutlinedIcon />}
              title="No drawings yet"
              description="Drawings appear here once teachers finish reviewing them."
            />
          )
        ) : (
          <InspirationMasonry
            cards={cards}
            loading={!ready || isLoading || loadingMore || settling}
            renderTile={(card) => (
              /*
               * One control in that corner, not two. At 375px a tile is about
               * 165px wide, and a badge plus two 44px targets does not fit in
               * it. The heart is the one to drop for staff: there is no teacher
               * Saved list to read it back from, so a teacher's saves go
               * nowhere, while taking a drawing off the shelf is the thing a
               * teacher is actually here to do.
               */
              <InspirationTile
                card={card}
                href={`${base}/${card.id}`}
                onOpen={rememberListUrl}
                onToggleSave={mode === 'staff' ? undefined : toggleSave}
                onHide={mode === 'staff' ? hideCard : undefined}
              />
            )}
          />
        )}

        <div ref={sentinel} aria-hidden />
        {hasMore && !loadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Button variant="outlined" onClick={() => setSize(size + 1)} sx={{ minHeight: 48 }}>
              Load more
            </Button>
          </Box>
        )}
      </Box>

      {mode === 'staff' && (
        <AddExemplarSheet
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            router.push(`${base}/${id}`);
          }}
        />
      )}
    </Box>
  );
}

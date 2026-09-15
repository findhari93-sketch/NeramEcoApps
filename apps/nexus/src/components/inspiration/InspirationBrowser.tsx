'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { prepareImages, setSaved } from './inspiration-api';
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
    // A new search or filter changes page 0's key, so SWR starts again from one page.
    { revalidateFirstPage: false, persistSize: false },
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

  const toggleSave = useCallback(
    async (card: InspirationCard) => {
      const next = !card.saved;
      const apply = (pages?: SearchPage[]) =>
        pages?.map((page) => ({
          ...page,
          items:
            savedOnly && !next
              ? page.items.filter((c) => c.id !== card.id)
              : page.items.map((c) => (c.id === card.id ? { ...c, saved: next } : c)),
        }));
      await mutate(apply(data), { revalidate: false });
      try {
        await setSaved(getToken, card.id, next);
      } catch {
        await mutate();
      }
    },
    [data, getToken, mutate, savedOnly],
  );

  const clearAll = () => {
    setInput('');
    setState(EMPTY_QUERY);
  };

  const filtered = hasActiveFilters(state) || scope === 'hidden';
  const empty = ready && !error && !isLoading && cards.length === 0;

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
            loading={!ready || isLoading || loadingMore}
            renderTile={(card) => (
              <InspirationTile card={card} href={`${base}/${card.id}`} onOpen={rememberListUrl} onToggleSave={toggleSave} />
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

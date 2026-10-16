'use client';

/**
 * The T8 body of /reviews: a sticky white filter bar (year, city, mode,
 * college), then the review wall on the light ground with page links under it.
 *
 * The page stays ISR: with no filter set, the server-rendered list (children) is
 * what everyone, search engines included, sees. Picking a filter fetches
 * /api/reviews/search (edge-cached) and shows those cards instead. The filters
 * live in the URL (?year=2026&city=Chennai) so a filtered view can be shared;
 * they are read from window.location on mount rather than useSearchParams,
 * which forces client rendering of the whole page at build.
 *
 * Mobile first: the four selects sit two by two at 375px, each 48px tall.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, MenuItem, TextField, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import { Link } from '@/i18n/routing';
import { CtaButton, EmptyState, FilterBar, ReviewWall, Surface, tokens as t, focusRing } from '@/design-system';
import type { PublicReview } from '@/lib/reviews/json-ld';
import {
  EMPTY_FILTERS,
  filtersToQuery,
  hasActiveFilters,
  parseReviewFilters,
  type ReviewFacets,
  type ReviewFilters as Filters,
} from '@/lib/reviews/hub';
import ReviewWallCard, { ReviewWallCardSkeleton, type ReviewWallCardLabels } from './ReviewWallCard';

export interface ReviewFilterLabels {
  heading: string;
  year: string;
  city: string;
  mode: string;
  college: string;
  any: string;
  clear: string;
  /** "{count} reviews match" */
  matches: string;
  /** "1 review matches" */
  matchesOne: string;
  noMatchTitle: string;
  noMatchBody: string;
  /** Heading over the list ("What students say"). */
  listTitle: string;
  card: ReviewWallCardLabels;
}

export interface ReviewPagination {
  /** Nav label ("Review pages"). */
  label: string;
  /** "Page 2 of 5" */
  pageOf: string;
  prevHref: string | null;
  nextHref: string | null;
  prevLabel: string;
  nextLabel: string;
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

/**
 * All / NATA / JEE Paper 2 as tabs along the bottom edge of the dark hero.
 * They are separate ISR pages, so these are links, not filters.
 */
export function ExamTabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <Box component="nav" aria-label={label} sx={{ borderTop: `1px solid ${t.lineDark}` }}>
      <Box
        component="ul"
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          my: 0,
          boxSizing: 'content-box',
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: { xs: 2.5, sm: 4 },
        }}
      >
        {tabs.map((tab) => (
          <Box component="li" key={tab.href}>
            <Box
              component={Link}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 48,
                fontSize: '0.9375rem',
                fontWeight: 600,
                textDecoration: 'none',
                color: tab.active ? t.paper : t.paperMuted,
                borderBottom: `2px solid ${tab.active ? t.gold500 : 'transparent'}`,
                transition: 'color 150ms ease, border-color 150ms ease',
                '&:hover': { color: t.paper, borderBottomColor: tab.active ? t.gold500 : t.outlineDark },
                ...focusRing,
              }}
            >
              {tab.label}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function ReviewFilters({
  exam,
  locale,
  facets,
  labels,
  lead,
  pagination,
  children,
}: {
  exam: 'all' | 'nata' | 'jee';
  locale: string;
  facets: ReviewFacets;
  labels: ReviewFilterLabels;
  /** Shown above the list whatever the filters (the facts block). */
  lead?: ReactNode;
  /** Page links under the unfiltered list; null when there is one page. */
  pagination?: ReviewPagination | null;
  /** The server-rendered list (a ReviewWall), or the empty state. */
  children: ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<{ total: number; reviews: PublicReview[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = hasActiveFilters(filters);

  // Filters from a shared link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = parseReviewFilters((k) => params.get(k));
    if (hasActiveFilters(fromUrl)) setFilters(fromUrl);
  }, []);

  useEffect(() => {
    const query = filtersToQuery(filters);
    // Keep the address bar in step without a navigation (the page is ISR).
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
    if (!hasActiveFilters(filters)) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/reviews/search?exam=${exam}&locale=${locale}&${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => {
        if (!cancelled) setResults({ total: Number(body.total) || 0, reviews: body.reviews || [] });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, exam, locale]);

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value || null }));
  }, []);
  const clear = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const hasAnyFacet = facets.years.length + facets.cities.length + facets.modes.length + facets.colleges.length > 0;
  const status = active && !loading && results ? (results.total === 1 ? labels.matchesOne : fill(labels.matches, { count: results.total })) : '';

  return (
    <>
      {hasAnyFacet && (
        <FilterBar
          summary={
            <Box component="span" role="status" aria-live="polite">
              {status}
            </Box>
          }
        >
          <Box
            role="group"
            aria-label={labels.heading}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(150px, 200px))' },
              gap: 1,
              width: { xs: '100%', md: 'auto' },
            }}
          >
            <ChoiceSelect label={labels.year} any={labels.any} value={filters.year ? String(filters.year) : ''} onChange={(v) => set('year', v ? Number(v) : null)} options={facets.years.map((y) => ({ value: String(y), label: String(y) }))} />
            <ChoiceSelect label={labels.city} any={labels.any} value={filters.city || ''} onChange={(v) => set('city', v)} options={facets.cities.map((c) => ({ value: c, label: c }))} />
            <ChoiceSelect
              label={labels.mode}
              any={labels.any}
              value={filters.mode || ''}
              onChange={(v) => set('mode', (v || null) as Filters['mode'])}
              options={facets.modes.map((m) => ({ value: m, label: labels.card.modes[m] }))}
            />
            <ChoiceSelect label={labels.college} any={labels.any} value={filters.college || ''} onChange={(v) => set('college', v)} options={facets.colleges.map((c) => ({ value: c, label: c }))} />
          </Box>
          {active && (
            <Box
              component="button"
              type="button"
              onClick={clear}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 44,
                px: 1.5,
                border: 0,
                bgcolor: 'transparent',
                font: 'inherit',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: t.inkMuted,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
                cursor: 'pointer',
                '&:hover': { color: t.ink },
                '& svg': { fontSize: 18 },
                ...focusRing,
              }}
            >
              <CloseIcon aria-hidden />
              {labels.clear}
            </Box>
          )}
        </FilterBar>
      )}

      <Surface tone="light" component="div">
        <Box
          sx={{
            maxWidth: t.container.page,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: { xs: 5, md: 7 },
            boxSizing: 'content-box',
            display: 'flex',
            flexDirection: 'column',
            gap: { xs: 4, md: 5 },
          }}
        >
          {lead}

          <Box component="section" aria-labelledby="reviews-list-title">
            <Typography id="reviews-list-title" component="h2" sx={{ m: 0, mb: 2.5, fontSize: { xs: '1.375rem', md: '1.625rem' }, fontWeight: 700, lineHeight: 1.25, color: t.ink }}>
              {labels.listTitle}
            </Typography>

            {!active ? (
              <>
                {children}
                {pagination && <PageLinks {...pagination} />}
              </>
            ) : loading ? (
              <Box aria-busy="true">
                <ReviewWall>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <ReviewWallCardSkeleton key={i} />
                  ))}
                </ReviewWall>
              </Box>
            ) : failed || !results || results.reviews.length === 0 ? (
              <EmptyState
                icon={<FilterAltOffOutlinedIcon />}
                title={labels.noMatchTitle}
                body={labels.noMatchBody}
                action={
                  <CtaButton variant="outline" size="md" endIcon={null} onClick={clear}>
                    {labels.clear}
                  </CtaButton>
                }
              />
            ) : (
              <ReviewWall>
                {results.reviews.map((r) => (
                  <ReviewWallCard key={r.id} review={r} labels={labels.card} />
                ))}
              </ReviewWall>
            )}
          </Box>
        </Box>
      </Surface>
    </>
  );
}

/** Previous / Page N of M / Next. Plain links, so every page is a cacheable ISR page. */
function PageLinks({ label, pageOf, prevHref, nextHref, prevLabel, nextLabel }: ReviewPagination) {
  const linkSx = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 104,
    px: 2.25,
    boxSizing: 'border-box',
    borderRadius: `${t.radius}px`,
    border: `1px solid ${t.ink}`,
    color: t.ink,
    fontSize: '0.9375rem',
    fontWeight: 600,
    textDecoration: 'none',
    transition: 'background-color 150ms ease, color 150ms ease',
    '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
    ...focusRing,
  } as const;
  return (
    <Box component="nav" aria-label={label} sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      {prevHref ? (
        <Box component={Link} href={prevHref} rel="prev" sx={linkSx}>
          {prevLabel}
        </Box>
      ) : (
        <Box sx={{ minWidth: 104 }} />
      )}
      <Typography component="p" aria-current="page" sx={{ m: 0, fontSize: '0.875rem', color: t.inkMuted, textAlign: 'center' }}>
        {pageOf}
      </Typography>
      {nextHref ? (
        <Box component={Link} href={nextHref} rel="next" sx={linkSx}>
          {nextLabel}
        </Box>
      ) : (
        <Box sx={{ minWidth: 104 }} />
      )}
    </Box>
  );
}

/** A 48px labelled select (MUI, so it opens as a listbox the E2E suite drives). */
function ChoiceSelect({
  label,
  any,
  value,
  onChange,
  options,
}: {
  label: string;
  any: string;
  value: string;
  onChange: (v: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={options.length === 0}
      fullWidth
      sx={{
        minWidth: 0,
        '& .MuiInputBase-root': { minHeight: 48, fontSize: 16, borderRadius: `${t.radius}px`, bgcolor: t.surface, color: t.ink },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: t.lineStrong },
        '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.ink },
        '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.navy900, borderWidth: 2 },
        '& .MuiInputLabel-root': { color: t.inkMuted },
        '& .MuiInputLabel-root.Mui-focused': { color: t.navy900 },
        '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
      }}
      SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360, borderRadius: `${t.radius}px`, border: `1px solid ${t.line}`, boxShadow: 'none' } } } }}
    >
      <MenuItem value="" sx={{ minHeight: 48 }}>
        {any}
      </MenuItem>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value} sx={{ minHeight: 48, whiteSpace: 'normal' }}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

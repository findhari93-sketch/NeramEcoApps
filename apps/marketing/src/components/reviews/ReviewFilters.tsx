'use client';

/**
 * Year, city, learning mode and college filters for /reviews.
 *
 * The page stays ISR: with no filter set, the server-rendered list (children) is
 * what everyone, search engines included, sees. Picking a filter fetches
 * /api/reviews/search (edge-cached) and shows those cards instead. The filters
 * live in the URL (?year=2026&city=Chennai) so a filtered view can be shared;
 * they are read from window.location on mount rather than useSearchParams,
 * which forces client rendering of the whole page at build.
 *
 * Mobile first: the four selects stack two by two at 375px, each 48px tall.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, MenuItem, Skeleton, Stack, TextField, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { PublicReview } from '@/lib/reviews/json-ld';
import {
  EMPTY_FILTERS,
  filtersToQuery,
  hasActiveFilters,
  parseReviewFilters,
  type ReviewFacets,
  type ReviewFilters as Filters,
} from '@/lib/reviews/hub';
import { ReviewCard, type ReviewCardLabels } from './ReviewParts';

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
  modes: Record<'online' | 'hybrid' | 'offline', string>;
  /** Card templates with {rating} / {college} placeholders. */
  starsTemplate: string;
  joinedTemplate: string;
  featured: string;
  verified: string;
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

export default function ReviewFilters({
  exam,
  locale,
  facets,
  labels,
  children,
}: {
  exam: 'all' | 'nata' | 'jee';
  locale: string;
  facets: ReviewFacets;
  labels: ReviewFilterLabels;
  children: React.ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<{ total: number; reviews: PublicReview[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef<HTMLDivElement>(null);
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

  const cardLabels: ReviewCardLabels = {
    stars: (rating) => fill(labels.starsTemplate, { rating }),
    joined: (college) => fill(labels.joinedTemplate, { college }),
    featured: labels.featured,
    verified: labels.verified,
    modes: labels.modes,
  };

  const hasAnyFacet = facets.years.length + facets.cities.length + facets.modes.length + facets.colleges.length > 0;

  return (
    <>
      {hasAnyFacet && (
        <Box component="section" aria-label={labels.heading} sx={{ mb: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <FilterSelect label={labels.year} any={labels.any} value={filters.year ? String(filters.year) : ''} onChange={(v) => set('year', v ? Number(v) : null)} options={facets.years.map((y) => ({ value: String(y), label: String(y) }))} />
            <FilterSelect label={labels.city} any={labels.any} value={filters.city || ''} onChange={(v) => set('city', v)} options={facets.cities.map((c) => ({ value: c, label: c }))} />
            <FilterSelect
              label={labels.mode}
              any={labels.any}
              value={filters.mode || ''}
              onChange={(v) => set('mode', (v || null) as Filters['mode'])}
              options={facets.modes.map((m) => ({ value: m, label: labels.modes[m] }))}
            />
            <FilterSelect label={labels.college} any={labels.any} value={filters.college || ''} onChange={(v) => set('college', v)} options={facets.colleges.map((c) => ({ value: c, label: c }))} />
          </Box>
          {active && (
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap' }}>
              <Typography ref={live} variant="body2" color="text.secondary" role="status" aria-live="polite">
                {loading ? '' : results ? (results.total === 1 ? labels.matchesOne : fill(labels.matches, { count: results.total })) : ''}
              </Typography>
              <Button startIcon={<CloseIcon />} onClick={() => setFilters(EMPTY_FILTERS)} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}>
                {labels.clear}
              </Button>
            </Stack>
          )}
        </Box>
      )}

      {!active ? (
        children
      ) : loading ? (
        <Box aria-busy="true" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
      ) : failed || !results || results.reviews.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center', border: '1px solid', borderColor: 'grey.200', borderRadius: 3 }}>
          <Typography component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            {labels.noMatchTitle}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {labels.noMatchBody}
          </Typography>
          <Button variant="outlined" onClick={() => setFilters(EMPTY_FILTERS)} sx={{ minHeight: 48, textTransform: 'none' }}>
            {labels.clear}
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {results.reviews.map((r) => (
            <ReviewCard key={r.id} review={r} labels={cardLabels} />
          ))}
        </Box>
      )}
    </>
  );
}

function FilterSelect({
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
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={options.length === 0}
      fullWidth
      sx={{ '& .MuiInputBase-root': { minHeight: 48, fontSize: 16 }, minWidth: 0 }}
      SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
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

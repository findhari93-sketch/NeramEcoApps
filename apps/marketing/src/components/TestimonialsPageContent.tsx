'use client';

/**
 * /testimonials on the T8 social-proof template: a dark PageHero with real
 * counts, a sticky white FilterBar, a masonry ReviewWall on the light ground
 * with "Load more", and the closing CtaBand. All data comes from
 * /api/testimonials; nothing on this page is a guessed number.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Box, Typography } from '@neram/ui';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import type { Testimonial, TestimonialLearningMode } from '@neram/database';
import {
  CtaBand,
  CtaButton,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHero,
  ReviewCard,
  ReviewWall,
  tokens as tk,
  type StatItem,
} from '@/design-system';
import { isOptimizableImage } from '@/lib/reviews/rules';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FilterOptions {
  years: number[];
  cities: string[];
  states: string[];
  courses: string[];
  modes: TestimonialLearningMode[];
}

interface TestimonialStats {
  total: number;
  avgRating: number;
  citiesCount: number;
  featuredCount: number;
}

interface Filters {
  year: string;
  city: string;
  course_name: string;
  learning_mode: string;
  exam_type: string;
}

const EMPTY_FILTERS: Filters = { year: '', city: '', course_name: '', learning_mode: '', exam_type: '' };
const ITEMS_PER_PAGE = 12;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatExamType(examType: string): string {
  switch (examType) {
    case 'NATA': return 'NATA';
    case 'JEE_PAPER_2': return 'JEE Paper 2';
    case 'BOTH': return 'NATA & JEE';
    default: return examType;
  }
}

function formatLearningMode(mode: string): string {
  switch (mode) {
    case 'online': return 'Online';
    case 'hybrid': return 'Hybrid';
    case 'offline': return 'Offline';
    default: return mode;
  }
}

// ─── Testimonial Card ───────────────────────────────────────────────────────

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const content = testimonial.content?.en || testimonial.content?.ta || Object.values(testimonial.content || {})[0] || '';
  const tag = [formatExamType(testimonial.exam_type), testimonial.year].filter(Boolean).join(' ');
  const meta = [
    testimonial.rank ? `AIR ${testimonial.rank}` : '',
    testimonial.city,
    testimonial.learning_mode ? formatLearningMode(testimonial.learning_mode) : '',
    testimonial.college_admitted,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ReviewCard
      quote={content}
      name={testimonial.student_name}
      meta={meta || undefined}
      tag={tag || undefined}
      rating={testimonial.rating}
      // next/image only takes our own storage URLs; anything else shows initials.
      photo={isOptimizableImage(testimonial.student_photo) ? testimonial.student_photo : null}
    >
      {testimonial.video_url && (
        <Box
          component="a"
          href={testimonial.video_url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            minHeight: 44,
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: tk.gold800,
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
            '&:hover': { color: tk.ink },
            '&:focus-visible': { outline: tk.focusOutline, outlineOffset: '2px' },
            '& svg': { fontSize: 22, color: tk.gold800 },
          }}
        >
          <PlayCircleOutlinedIcon aria-hidden />
          Watch the video review
        </Box>
      )}
    </ReviewCard>
  );
}

// ─── Skeleton Card ──────────────────────────────────────────────────────────

function TestimonialSkeleton() {
  const bar = (width: string, height = 12) => (
    <Box sx={{ height, width, borderRadius: `${tk.radius}px`, bgcolor: tk.line }} />
  );
  return (
    <Box
      aria-hidden
      sx={{
        breakInside: 'avoid',
        mb: 2.5,
        p: 2.75,
        bgcolor: tk.surface,
        border: `1px solid ${tk.line}`,
        borderRadius: `${tk.radius}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      {bar('40%', 14)}
      {bar('100%')}
      {bar('92%')}
      {bar('70%')}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', pt: 1.75, borderTop: `1px solid ${tk.line}` }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: tk.line, flexShrink: 0 }} />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {bar('50%')}
          {bar('35%', 10)}
        </Box>
      </Box>
    </Box>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TestimonialsPageContent({
  averageRating = null,
}: {
  /** From published reviews (server helper); null hides the rating rather than guessing one. */
  averageRating?: number | null;
} = {}) {
  const t = useTranslations('testimonials');
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<TestimonialStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Filters from a shared link are read after mount, not with useSearchParams:
  // that hook made this whole page render in the browser only, so search
  // engines got an empty page with no H1.
  const [urlRead, setUrlRead] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFilters({
      year: q.get('year') || '',
      city: q.get('city') || '',
      course_name: q.get('course_name') || '',
      learning_mode: q.get('learning_mode') || '',
      exam_type: q.get('exam_type') || '',
    });
    setUrlRead(true);
  }, []);

  // Build query string from filters
  const buildQueryString = useCallback((f: Filters, offset = 0) => {
    const params = new URLSearchParams();
    if (f.year) params.set('year', f.year);
    if (f.city) params.set('city', f.city);
    if (f.course_name) params.set('course_name', f.course_name);
    if (f.learning_mode) params.set('learning_mode', f.learning_mode);
    if (f.exam_type) params.set('exam_type', f.exam_type);
    params.set('limit', String(ITEMS_PER_PAGE));
    params.set('offset', String(offset));
    return params.toString();
  }, []);

  // Update URL with filters
  const updateUrl = useCallback((f: Filters) => {
    const params = new URLSearchParams();
    if (f.year) params.set('year', f.year);
    if (f.city) params.set('city', f.city);
    if (f.course_name) params.set('course_name', f.course_name);
    if (f.learning_mode) params.set('learning_mode', f.learning_mode);
    if (f.exam_type) params.set('exam_type', f.exam_type);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [pathname, router]);

  // Fetch testimonials
  const fetchTestimonials = useCallback(async (f: Filters, offset = 0, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/testimonials?${buildQueryString(f, offset)}`);
      const json = await res.json();
      if (json.success) {
        if (append) {
          setTestimonials((prev) => [...prev, ...json.data]);
        } else {
          setTestimonials(json.data || []);
        }
        setTotalCount(json.count || 0);
      }
    } catch {
      // Silently fail, keeps current data
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQueryString]);

  // Fetch stats and filter options on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/testimonials?stats=true').then((r) => r.json()),
      fetch('/api/testimonials?filters=true').then((r) => r.json()),
    ]).then(([statsJson, filtersJson]) => {
      if (statsJson.success) setStats(statsJson.data);
      else setStatsFailed(true);
      if (filtersJson.success) setFilterOptions(filtersJson.data);
    }).catch(() => {
      // No numbers is better than a guessed one: the stat strip is dropped.
      setStatsFailed(true);
    });
  }, []);

  // Fetch testimonials when filters change
  useEffect(() => {
    if (!urlRead) return;
    fetchTestimonials(filters);
    updateUrl(filters);
  }, [urlRead, filters, fetchTestimonials, updateUrl]);

  const setFilter = (key: keyof Filters) => (value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const handleLoadMore = () => {
    fetchTestimonials(filters, testimonials.length, true);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Only numbers read from published reviews; nothing is shown as a guess.
  // value: null renders a skeleton while the stats load.
  const statItems: StatItem[] | undefined = statsFailed
    ? undefined
    : [
        { value: stats ? stats.total.toLocaleString() : null, label: t('students') },
        { value: stats ? String(stats.citiesCount) : null, label: t('cities') },
        ...(averageRating != null ? [{ value: averageRating.toFixed(1), label: t('avgRating') }] : []),
      ];

  const showing = !loading && testimonials.length > 0 ? t('showing', { shown: testimonials.length, total: totalCount }) : '';

  return (
    <>
      <PageHero eyebrow="Student voices" title={t('title')} lede={t('subtitle')} stats={statItems} />

      <FilterBar
        onClear={activeFilterCount > 0 ? clearFilters : undefined}
        summary={
          <Box component="span" role="status" aria-live="polite">
            {showing}
          </Box>
        }
      >
        <FilterSelect
          label={t('filterYear')}
          allLabel={t('allYears')}
          value={filters.year}
          onChange={setFilter('year')}
          options={(filterOptions?.years ?? []).map((y) => ({ value: String(y), label: String(y) }))}
        />
        <FilterSelect
          label={t('filterCourse')}
          allLabel={t('allCourses')}
          value={filters.course_name}
          onChange={setFilter('course_name')}
          options={(filterOptions?.courses ?? []).map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          label={t('filterCity')}
          allLabel={t('allCities')}
          value={filters.city}
          onChange={setFilter('city')}
          options={(filterOptions?.cities ?? []).map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          label={t('filterMode')}
          allLabel={t('allModes')}
          value={filters.learning_mode}
          onChange={setFilter('learning_mode')}
          options={(filterOptions?.modes ?? []).map((m) => ({ value: m, label: formatLearningMode(m) }))}
        />
      </FilterBar>

      {/* ─── Review wall ─── */}
      <Box component="section" aria-label={t('title')} sx={{ bgcolor: tk.ground, color: tk.ink }}>
        <Box sx={{ maxWidth: tk.container.page, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 5, md: 7 }, boxSizing: 'content-box' }}>
          {loading ? (
            <Box aria-busy="true">
              <ReviewWall>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TestimonialSkeleton key={i} />
                ))}
              </ReviewWall>
            </Box>
          ) : testimonials.length === 0 ? (
            <EmptyState
              icon={<RateReviewOutlinedIcon />}
              title={t('noResults')}
              action={
                activeFilterCount > 0 ? (
                  <CtaButton variant="outline" size="md" endIcon={null} onClick={clearFilters}>
                    {t('clearAll')}
                  </CtaButton>
                ) : undefined
              }
            />
          ) : (
            <>
              <ReviewWall>
                {testimonials.map((testimonial) => (
                  <TestimonialCard key={testimonial.id} testimonial={testimonial} />
                ))}
                {loadingMore && [0, 1, 2].map((i) => <TestimonialSkeleton key={`more-${i}`} />)}
              </ReviewWall>

              {/* Load more / count */}
              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', color: tk.inkMuted }}>
                  {t('showing', { shown: testimonials.length, total: totalCount })}
                </Typography>
                {testimonials.length < totalCount && (
                  <CtaButton variant="outline" endIcon={null} onClick={handleLoadMore} disabled={loadingMore}>
                    {t('loadMore')}
                  </CtaButton>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      <CtaBand
        title={t('cta')}
        actions={
          <>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="link" href="/demo-class">
              Book Demo Class
            </CtaButton>
          </>
        }
      />
    </>
  );
}

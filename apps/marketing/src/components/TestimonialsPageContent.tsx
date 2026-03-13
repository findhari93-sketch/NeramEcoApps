'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ThemeProvider } from '@mui/material/styles';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Skeleton,
  Avatar,
} from '@neram/ui';
import { neramaiArchitekDarkTheme } from '@neram/ui';
import StarIcon from '@mui/icons-material/Star';
import FilterListIcon from '@mui/icons-material/FilterList';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { SelectChangeEvent } from '@mui/material';
import type { Testimonial, TestimonialLearningMode } from '@neram/database';
import { Link } from '@/i18n/routing';

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

const ITEMS_PER_PAGE = 12;

// ─── Helper: format exam type for display ───────────────────────────────────

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

// ─── Render Star Rating ─────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <Box sx={{ display: 'flex', gap: 0.25, mb: 1.5 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          sx={{
            fontSize: 16,
            color: star <= rating ? 'primary.main' : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </Box>
  );
}

// ─── Testimonial Card ───────────────────────────────────────────────────────

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const content = testimonial.content?.en || testimonial.content?.ta || Object.values(testimonial.content || {})[0] || '';

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'rgba(11,22,41,0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: testimonial.is_featured ? '3px solid' : '1px solid rgba(255,255,255,0.08)',
        borderLeftColor: testimonial.is_featured ? 'primary.main' : undefined,
        borderRadius: '16px',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 12px 40px rgba(232,160,32,0.1)',
          borderColor: 'rgba(232,160,32,0.2)',
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 }, display: 'flex', flexDirection: 'column' }}>
        {/* Rating */}
        <StarRating rating={testimonial.rating} />

        {/* Quote */}
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.7,
            mb: 2.5,
            flexGrow: 1,
            fontSize: { xs: '0.85rem', sm: '0.875rem' },
          }}
        >
          &ldquo;{content}&rdquo;
        </Typography>

        {/* Student Info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={testimonial.student_photo || undefined}
            alt={testimonial.student_name}
            sx={{
              width: 44,
              height: 44,
              border: '2px solid',
              borderColor: 'primary.main',
              fontSize: '1rem',
              bgcolor: 'rgba(232,160,32,0.2)',
              color: 'primary.main',
            }}
          >
            {testimonial.student_name?.charAt(0)?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {testimonial.student_name}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'primary.main',
                opacity: 0.85,
                lineHeight: 1.3,
                display: 'block',
              }}
            >
              {formatExamType(testimonial.exam_type)} {testimonial.year}
              {testimonial.rank ? ` \u2022 AIR ${testimonial.rank}` : ''}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255,255,255,0.5)',
                lineHeight: 1.3,
                display: 'block',
              }}
            >
              {testimonial.city} \u2022 {formatLearningMode(testimonial.learning_mode)}
              {testimonial.college_admitted ? ` \u2022 ${testimonial.college_admitted}` : ''}
            </Typography>
          </Box>
        </Box>

        {/* Video link */}
        {testimonial.video_url && (
          <Button
            component="a"
            href={testimonial.video_url}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            startIcon={<PlayCircleOutlineIcon />}
            sx={{
              mt: 1.5,
              color: 'primary.main',
              textTransform: 'none',
              fontSize: '0.75rem',
              p: 0,
              justifyContent: 'flex-start',
              '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
            }}
          >
            Watch Video Review
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Testimonial Skeleton ───────────────────────────────────────────────────

function TestimonialSkeleton() {
  return (
    <Card
      sx={{
        height: 260,
        bgcolor: 'rgba(11,22,41,0.75)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="circular" width={16} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
          ))}
        </Box>
        <Skeleton variant="text" sx={{ bgcolor: 'rgba(255,255,255,0.08)', mb: 0.5 }} />
        <Skeleton variant="text" sx={{ bgcolor: 'rgba(255,255,255,0.08)', mb: 0.5 }} />
        <Skeleton variant="text" width="70%" sx={{ bgcolor: 'rgba(255,255,255,0.08)', mb: 3 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="circular" width={44} height={44} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
          <Box>
            <Skeleton variant="text" width={120} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
            <Skeleton variant="text" width={80} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Stat Box ───────────────────────────────────────────────────────────────

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        px: { xs: 2, sm: 3 },
        py: 1.5,
      }}
    >
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          color: 'primary.main',
          lineHeight: 1.2,
          fontSize: { xs: '1.5rem', sm: '2rem' },
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: 'rgba(255,255,255,0.6)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontSize: { xs: '0.65rem', sm: '0.7rem' },
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TestimonialsPageContent() {
  const t = useTranslations('testimonials');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<TestimonialStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<Filters>({
    year: searchParams.get('year') || '',
    city: searchParams.get('city') || '',
    course_name: searchParams.get('course_name') || '',
    learning_mode: searchParams.get('learning_mode') || '',
    exam_type: searchParams.get('exam_type') || '',
  });

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
      // Silently fail — keeps current data
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
      if (filtersJson.success) setFilterOptions(filtersJson.data);
    }).catch(() => {
      // Silently fail
    });
  }, []);

  // Fetch testimonials when filters change
  useEffect(() => {
    fetchTestimonials(filters);
    updateUrl(filters);
  }, [filters, fetchTestimonials, updateUrl]);

  // Handle filter change
  const handleFilterChange = (key: keyof Filters) => (event: SelectChangeEvent<string>) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({ year: '', city: '', course_name: '', learning_mode: '', exam_type: '' });
  };

  // Load more
  const handleLoadMore = () => {
    fetchTestimonials(filters, testimonials.length, true);
  };

  // Active filter count
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Active filter chips data
  const activeFilters: { key: keyof Filters; label: string }[] = [];
  if (filters.year) activeFilters.push({ key: 'year', label: filters.year });
  if (filters.city) activeFilters.push({ key: 'city', label: filters.city });
  if (filters.course_name) activeFilters.push({ key: 'course_name', label: filters.course_name });
  if (filters.learning_mode) activeFilters.push({ key: 'learning_mode', label: formatLearningMode(filters.learning_mode) });
  if (filters.exam_type) activeFilters.push({ key: 'exam_type', label: formatExamType(filters.exam_type) });

  // Select styling
  const selectSx = {
    color: 'text.primary',
    '.MuiOutlinedInput-notchedOutline': {
      borderColor: 'rgba(255,255,255,0.15)',
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: 'rgba(255,255,255,0.3)',
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: 'primary.main',
    },
    '.MuiSelect-icon': {
      color: 'rgba(255,255,255,0.5)',
    },
    fontSize: '0.875rem',
  };

  const menuProps = {
    PaperProps: {
      sx: {
        bgcolor: 'rgba(11,22,41,0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        '& .MuiMenuItem-root': {
          fontSize: '0.875rem',
          '&:hover': { bgcolor: 'rgba(232,160,32,0.1)' },
          '&.Mui-selected': { bgcolor: 'rgba(232,160,32,0.15)' },
        },
      },
    },
  };

  return (
    <ThemeProvider theme={neramaiArchitekDarkTheme}>
      <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh' }}>

        {/* ─── Hero Section ─── */}
        <Box
          sx={{
            pt: { xs: 8, md: 12 },
            pb: { xs: 4, md: 6 },
            position: 'relative',
            textAlign: 'center',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at 50% 30%, rgba(232,160,32,0.06) 0%, transparent 60%)',
              pointerEvents: 'none',
            },
          }}
        >
          <Container maxWidth="md" sx={{ position: 'relative' }}>
            <Typography
              sx={{
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                mb: 1.5,
              }}
            >
              STUDENT VOICES
            </Typography>
            <Typography
              variant="h2"
              component="h1"
              sx={{
                fontWeight: 700,
                mb: 2,
                fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' },
              }}
            >
              {t('title')}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 560, mx: 'auto', lineHeight: 1.6 }}
            >
              {t('subtitle')}
            </Typography>

            {/* Stats Ribbon */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: { xs: 0, sm: 1 },
                bgcolor: 'rgba(11,22,41,0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                py: 1,
                px: 2,
                mx: 'auto',
                maxWidth: 600,
              }}
            >
              {stats ? (
                <>
                  <StatBox value={`${stats.total > 0 ? stats.total.toLocaleString() : '2500'}+`} label={t('students')} />
                  <StatBox value={`${stats.citiesCount > 0 ? stats.citiesCount : '50'}+`} label={t('cities')} />
                  <StatBox value={stats.avgRating > 0 ? `${stats.avgRating}` : '4.8'} label={t('avgRating')} />
                </>
              ) : (
                <>
                  <StatBox value="2500+" label={t('students')} />
                  <StatBox value="50+" label={t('cities')} />
                  <StatBox value="4.8" label={t('avgRating')} />
                </>
              )}
            </Box>
          </Container>
        </Box>

        {/* ─── Filter Bar ─── */}
        <Box
          sx={{
            position: 'sticky',
            top: { xs: 56, md: 64 },
            zIndex: 10,
            bgcolor: 'rgba(5,12,26,0.9)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            py: 2,
          }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                alignItems: 'center',
              }}
            >
              <FilterListIcon sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 20, display: { xs: 'none', sm: 'block' } }} />

              {/* Year */}
              <FormControl size="small" sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 130 } }}>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{t('filterYear')}</InputLabel>
                <Select
                  value={filters.year}
                  label={t('filterYear')}
                  onChange={handleFilterChange('year')}
                  sx={selectSx}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">{t('allYears')}</MenuItem>
                  {filterOptions?.years.map((y) => (
                    <MenuItem key={y} value={String(y)}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Course */}
              <FormControl size="small" sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 160 } }}>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{t('filterCourse')}</InputLabel>
                <Select
                  value={filters.course_name}
                  label={t('filterCourse')}
                  onChange={handleFilterChange('course_name')}
                  sx={selectSx}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">{t('allCourses')}</MenuItem>
                  {filterOptions?.courses.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* City */}
              <FormControl size="small" sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 140 } }}>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{t('filterCity')}</InputLabel>
                <Select
                  value={filters.city}
                  label={t('filterCity')}
                  onChange={handleFilterChange('city')}
                  sx={selectSx}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">{t('allCities')}</MenuItem>
                  {filterOptions?.cities.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Learning Mode */}
              <FormControl size="small" sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 150 } }}>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{t('filterMode')}</InputLabel>
                <Select
                  value={filters.learning_mode}
                  label={t('filterMode')}
                  onChange={handleFilterChange('learning_mode')}
                  sx={selectSx}
                  MenuProps={menuProps}
                >
                  <MenuItem value="">{t('allModes')}</MenuItem>
                  {filterOptions?.modes.map((m) => (
                    <MenuItem key={m} value={m}>{formatLearningMode(m)}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Clear All */}
              {activeFilterCount > 0 && (
                <Button
                  size="small"
                  onClick={clearFilters}
                  sx={{
                    color: 'primary.main',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    ml: { xs: 0, sm: 'auto' },
                  }}
                >
                  {t('clearAll')}
                </Button>
              )}
            </Box>

            {/* Active filter chips */}
            {activeFilters.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                {activeFilters.map((f) => (
                  <Chip
                    key={f.key}
                    label={f.label}
                    size="small"
                    onDelete={() => setFilters((prev) => ({ ...prev, [f.key]: '' }))}
                    sx={{
                      bgcolor: 'rgba(232,160,32,0.15)',
                      color: 'primary.main',
                      borderColor: 'rgba(232,160,32,0.3)',
                      '& .MuiChip-deleteIcon': {
                        color: 'rgba(232,160,32,0.6)',
                        '&:hover': { color: 'primary.main' },
                      },
                      fontSize: '0.75rem',
                    }}
                    variant="outlined"
                  />
                ))}
              </Box>
            )}
          </Container>
        </Box>

        {/* ─── Testimonials Grid ─── */}
        <Box sx={{ py: { xs: 4, md: 6 } }}>
          <Container maxWidth="lg">
            {loading ? (
              <Grid container spacing={3}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Grid item xs={12} sm={6} lg={4} key={i}>
                    <TestimonialSkeleton />
                  </Grid>
                ))}
              </Grid>
            ) : testimonials.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <Typography
                  variant="h6"
                  sx={{ color: 'rgba(255,255,255,0.5)', mb: 2 }}
                >
                  {t('noResults')}
                </Typography>
                <Button
                  onClick={clearFilters}
                  variant="outlined"
                  sx={{
                    color: 'primary.main',
                    borderColor: 'primary.main',
                    textTransform: 'none',
                  }}
                >
                  {t('clearAll')}
                </Button>
              </Box>
            ) : (
              <>
                <Grid container spacing={3}>
                  {testimonials.map((testimonial) => (
                    <Grid item xs={12} sm={6} lg={4} key={testimonial.id}>
                      <TestimonialCard testimonial={testimonial} />
                    </Grid>
                  ))}
                </Grid>

                {/* Load More / Count */}
                <Box sx={{ textAlign: 'center', mt: 5 }}>
                  <Typography
                    variant="body2"
                    sx={{ color: 'rgba(255,255,255,0.4)', mb: 2 }}
                  >
                    {t('showing', { shown: testimonials.length, total: totalCount })}
                  </Typography>
                  {testimonials.length < totalCount && (
                    <Button
                      variant="outlined"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      sx={{
                        color: 'primary.main',
                        borderColor: 'rgba(232,160,32,0.4)',
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 4,
                        py: 1.25,
                        borderRadius: '12px',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: 'rgba(232,160,32,0.08)',
                        },
                      }}
                    >
                      {loadingMore ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              border: '2px solid rgba(232,160,32,0.3)',
                              borderTopColor: 'primary.main',
                              borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite',
                              '@keyframes spin': {
                                to: { transform: 'rotate(360deg)' },
                              },
                            }}
                          />
                          Loading...
                        </Box>
                      ) : (
                        t('loadMore')
                      )}
                    </Button>
                  )}
                </Box>
              </>
            )}
          </Container>
        </Box>

        {/* ─── CTA Section ─── */}
        <Box
          sx={{
            py: { xs: 8, md: 10 },
            textAlign: 'center',
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at 50% 50%, rgba(232,160,32,0.06) 0%, transparent 60%)',
              pointerEvents: 'none',
            },
            borderTop: '1px solid rgba(232,160,32,0.08)',
          }}
        >
          <Container maxWidth="sm" sx={{ position: 'relative' }}>
            <Typography
              sx={{
                fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'primary.main',
                mb: 2,
              }}
            >
              GET STARTED
            </Typography>
            <Typography
              variant="h4"
              component="h2"
              sx={{ mb: 2, fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}
            >
              {t('cta')}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                flexWrap: 'wrap',
                mt: 4,
              }}
            >
              <Button
                component={Link}
                href="/apply"
                variant="contained"
                size="large"
                sx={{
                  px: 4,
                  py: 1.5,
                  fontSize: '14px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1.25,
                  '& .arrow': { fontSize: '18px', transition: 'transform 0.3s' },
                  '&:hover .arrow': { transform: 'translateX(4px)' },
                }}
              >
                Apply Now
                <span className="arrow">&rarr;</span>
              </Button>
              <Button
                component={Link}
                href="/demo-class"
                variant="text"
                size="large"
                sx={{
                  color: 'text.primary',
                  px: 0.5,
                  py: 1.5,
                  borderBottom: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 0,
                  textTransform: 'none',
                  '&:hover': {
                    color: 'primary.main',
                    borderBottomColor: 'primary.main',
                    bgcolor: 'transparent',
                  },
                }}
              >
                Book Demo Class &nearr;
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

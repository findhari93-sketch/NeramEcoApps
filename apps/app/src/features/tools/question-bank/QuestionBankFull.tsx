'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Stack, Button, Chip, Alert, Skeleton, Snackbar, Card, CardContent } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { QuestionPostDisplay } from '@neram/database';
import QuestionCard from '@/components/question-bank/QuestionCard';
import CategoryFilter, { QB_CATEGORY_VALUES } from '@/components/question-bank/CategoryFilter';
import ExamProfileOnboarding from '@/components/question-bank/ExamProfileOnboarding';
import { readQbOnboarding, writeQbOnboarding } from '@/components/question-bank/qb-onboarding-storage';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { TOOLS_HOME_HREF } from '@/lib/navigation-data';

type SortBy = 'newest' | 'most_voted';

const NEW_QUESTION_HREF = '/tools/nata/question-bank/new';

function ListSkeleton() {
  return (
    <Stack spacing={2} aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Skeleton variant="circular" width={28} height={28} />
              <Skeleton variant="text" width={120} />
            </Stack>
            <Skeleton variant="text" width="75%" height={28} />
            <Skeleton variant="text" width="95%" />
            <Skeleton variant="text" width="60%" />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Skeleton variant="rounded" width={96} height={24} />
              <Skeleton variant="rounded" width={72} height={24} />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function PageSkeleton() {
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <ToolPageHeader toolId="nata-question-bank" />
      <ListSkeleton />
    </Box>
  );
}

function QuestionBankContent() {
  const { user, loading: authLoading } = useFirebaseAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filters live in the URL so Back from a question restores them
  const rawCategory = searchParams.get('category') ?? '';
  const category = QB_CATEGORY_VALUES.includes(rawCategory) ? rawCategory : '';
  const sortBy: SortBy = searchParams.get('sort') === 'most_voted' ? 'most_voted' : 'newest';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const justPosted = searchParams.get('posted') === 'true';

  const [questions, setQuestions] = useState<QuestionPostDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [postedOpen, setPostedOpen] = useState(false);

  // Onboarding gate state
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      return (await getFirebaseAuth().currentUser?.getIdToken()) || null;
    } catch {
      return null;
    }
  }, []);

  const leaveQuestionBank = useCallback(() => {
    // There is no /tools/nata page; the tools hub is the safe place to land
    router.replace(TOOLS_HOME_HREF);
  }, [router]);

  const updateQuery = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // "Sent for review" confirmation after posting, then drop the flag from the URL
  useEffect(() => {
    if (!justPosted) return;
    setPostedOpen(true);
    updateQuery({ posted: null });
  }, [justPosted, updateQuery]);

  // Onboarding check, once the signed-in user is known
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }

    const cached = readQbOnboarding(userId);
    if (cached.done) {
      if (cached.status === 'not_interested') {
        leaveQuestionBank();
        return;
      }
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          if (!cancelled) setNeedsOnboarding(true);
          return;
        }
        const res = await fetch('/api/questions/exam-profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          if (data.data?.qb_onboarding_completed) {
            writeQbOnboarding(userId, data.data.nata_status);
            if (data.data.nata_status === 'not_interested') {
              leaveQuestionBank();
              return;
            }
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        } else {
          setNeedsOnboarding(true);
        }
      } catch {
        // On error, show onboarding to be safe
        if (!cancelled) setNeedsOnboarding(true);
      } finally {
        if (!cancelled) setOnboardingChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, getAuthToken, leaveQuestionBank]);

  // Question list: only the response for the current filters may land
  useEffect(() => {
    if (!onboardingChecked || needsOnboarding) return;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = userId ? await getAuthToken() : null;
        const params = new URLSearchParams({
          page: String(page),
          limit: '20',
          sortBy,
          examType: 'NATA',
        });
        if (category) params.set('category', category);

        const res = await fetch(`/api/questions?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (controller.signal.aborted) return;
        setQuestions(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error fetching questions:', error);
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setLoadError(
          offline
            ? 'You seem to be offline. Check your connection and try again.'
            : 'Could not load questions. Please try again.'
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [onboardingChecked, needsOnboarding, userId, page, sortBy, category, getAuthToken, reloadKey]);

  const handleCategoryChange = (newCategory: string) => {
    updateQuery({ category: newCategory || null, page: null });
  };

  const handleSortChange = (next: SortBy) => {
    updateQuery({ sort: next === 'newest' ? null : next, page: null });
  };

  const goToPage = (next: number) => {
    updateQuery({ page: next <= 1 ? null : String(next) });
    if (typeof window !== 'undefined') {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
  };

  const postedSnackbar = (
    <Snackbar
      open={postedOpen}
      autoHideDuration={6000}
      onClose={() => setPostedOpen(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="success" onClose={() => setPostedOpen(false)} sx={{ width: '100%' }}>
        Question sent for review. It usually goes live within 24 hours.
      </Alert>
    </Snackbar>
  );

  // Checking onboarding
  if (!onboardingChecked) {
    return (
      <>
        <PageSkeleton />
        {postedSnackbar}
      </>
    );
  }

  // Onboarding gate for signed-in users who have not completed it
  if (userId && needsOnboarding) {
    return (
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        <ToolPageHeader toolId="nata-question-bank" />
        <ExamProfileOnboarding
          userId={userId}
          getAuthToken={getAuthToken}
          onComplete={() => setNeedsOnboarding(false)}
          onBlocked={leaveQuestionBank}
        />
      </Box>
    );
  }

  const sortChipSx = { height: 44, px: 0.5, fontSize: '0.875rem' } as const;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pb: { xs: 10, md: 0 } }}>
      <ToolPageHeader
        toolId="nata-question-bank"
        description="Community-shared questions from past NATA exam sessions, with answers and discussion."
        actions={
          userId ? (
            <Button
              component={Link}
              href={NEW_QUESTION_HREF}
              variant="contained"
              startIcon={<AddRoundedIcon />}
              sx={{ display: { xs: 'none', md: 'inline-flex' }, minHeight: 44, whiteSpace: 'nowrap' }}
            >
              Post a question
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Box sx={{ mb: 1.5 }}>
        <CategoryFilter selected={category} onChange={handleCategoryChange} />
      </Box>

      {/* Sort */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} role="group" aria-label="Sort questions">
        <Chip
          label="Newest"
          color={sortBy === 'newest' ? 'primary' : 'default'}
          variant={sortBy === 'newest' ? 'filled' : 'outlined'}
          onClick={() => handleSortChange('newest')}
          aria-pressed={sortBy === 'newest'}
          sx={sortChipSx}
        />
        <Chip
          label="Most voted"
          color={sortBy === 'most_voted' ? 'primary' : 'default'}
          variant={sortBy === 'most_voted' ? 'filled' : 'outlined'}
          onClick={() => handleSortChange('most_voted')}
          aria-pressed={sortBy === 'most_voted'}
          sx={sortChipSx}
        />
      </Stack>

      {/* Questions list */}
      <Box aria-busy={loading} aria-live="polite">
        {loading ? (
          <ListSkeleton />
        ) : loadError ? (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" onClick={() => setReloadKey((n) => n + 1)} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : questions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              {category ? 'No questions in this category yet' : 'No questions yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Be the first to share a question from your NATA exam.
            </Typography>
            {userId && (
              <Button component={Link} href={NEW_QUESTION_HREF} variant="contained" startIcon={<AddRoundedIcon />} sx={{ minHeight: 44 }}>
                Post a question
              </Button>
            )}
          </Box>
        ) : (
          <Stack spacing={2} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {questions.map((q) => (
              <Box component="li" key={q.id}>
                <QuestionCard question={q} />
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Pagination */}
      {!loading && !loadError && totalPages > 1 && (
        <Stack
          component="nav"
          aria-label="Question pages"
          direction="row"
          justifyContent="center"
          alignItems="center"
          spacing={1.5}
          sx={{ mt: 3 }}
        >
          <Button
            variant="outlined"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            startIcon={<ChevronLeftRoundedIcon />}
            sx={{ minHeight: 44 }}
          >
            Previous
          </Button>
          <Typography variant="body2" aria-current="page">
            Page {page} of {totalPages}
          </Typography>
          <Button
            variant="outlined"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            endIcon={<ChevronRightRoundedIcon />}
            sx={{ minHeight: 44 }}
          >
            Next
          </Button>
        </Stack>
      )}

      {/* FAB for phones */}
      {userId && (
        <Box
          component={Link}
          href={NEW_QUESTION_HREF}
          aria-label="Post a question"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            // Clear of the phone tab bar (set by AppShell)
            bottom: 'calc(var(--app-bottom-inset, 0px) + 16px)',
            right: 16,
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            boxShadow: 4,
            zIndex: 1000,
            '&:focus-visible': { outline: '3px solid var(--focus-ring-color)', outlineOffset: 2 },
          }}
        >
          <AddRoundedIcon />
        </Box>
      )}

      {postedSnackbar}
    </Box>
  );
}

export default function QuestionBankPage() {
  // useSearchParams needs a Suspense boundary or the route fails to prerender
  return (
    <Suspense fallback={<PageSkeleton />}>
      <QuestionBankContent />
    </Suspense>
  );
}

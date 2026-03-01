'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Stack, Button, CircularProgress, Chip } from '@neram/ui';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { QuestionPostDisplay } from '@neram/database';
import QuestionCard from '@/components/question-bank/QuestionCard';
import CategoryFilter from '@/components/question-bank/CategoryFilter';
import ExamProfileOnboarding from '@/components/question-bank/ExamProfileOnboarding';

export default function QuestionBankPage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const [questions, setQuestions] = useState<QuestionPostDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'most_voted'>('newest');

  // Onboarding gate state
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    try {
      const auth = getFirebaseAuth();
      return await auth.currentUser?.getIdToken() || null;
    } catch {
      return null;
    }
  }, []);

  // Check onboarding status
  useEffect(() => {
    if (!user) {
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }

    // Fast check via localStorage
    const cached = localStorage.getItem('qb_onboarding_done');
    if (cached === 'true') {
      const status = localStorage.getItem('qb_nata_status');
      if (status === 'not_interested') {
        // Blocked user somehow got back — redirect
        router.push('/tools/nata');
        return;
      }
      setOnboardingChecked(true);
      setNeedsOnboarding(false);
      return;
    }

    // API check
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          setOnboardingChecked(true);
          return;
        }
        const res = await fetch('/api/questions/exam-profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data?.qb_onboarding_completed) {
            localStorage.setItem('qb_onboarding_done', 'true');
            localStorage.setItem('qb_nata_status', data.data.nata_status);
            if (data.data.nata_status === 'not_interested') {
              router.push('/tools/nata');
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
        setNeedsOnboarding(true);
      } finally {
        setOnboardingChecked(true);
      }
    })();
  }, [user, getAuthToken, router]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      let authHeader = '';
      if (user) {
        try {
          const auth = getFirebaseAuth();
          const token = await auth.currentUser?.getIdToken();
          if (token) authHeader = `Bearer ${token}`;
        } catch { /* not authenticated */ }
      }

      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sortBy,
        examType: 'NATA',
      });
      if (category) params.set('category', category);

      const res = await fetch(`/api/questions?${params}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setQuestions(data.data);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  }, [page, category, sortBy, user]);

  useEffect(() => {
    if (onboardingChecked && !needsOnboarding) {
      fetchQuestions();
    }
  }, [fetchQuestions, onboardingChecked, needsOnboarding]);

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setPage(1);
  };

  // Show loading while checking onboarding
  if (!onboardingChecked) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Show onboarding gate for authenticated users who haven't completed it
  if (user && needsOnboarding) {
    return (
      <ExamProfileOnboarding
        getAuthToken={getAuthToken}
        onComplete={() => setNeedsOnboarding(false)}
        onBlocked={() => router.push('/tools/nata')}
      />
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            NATA Question Bank
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Community-shared questions from past NATA exam sessions
          </Typography>
        </Box>
        {user && (
          <Button
            component={Link}
            href="/tools/nata/question-bank/new"
            variant="contained"
            size="small"
            sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
          >
            + Post Question
          </Button>
        )}
      </Stack>

      {/* Filters */}
      <Box sx={{ mb: 2 }}>
        <CategoryFilter selected={category} onChange={handleCategoryChange} />
      </Box>

      {/* Sort */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip
          label="Newest"
          size="small"
          color={sortBy === 'newest' ? 'primary' : 'default'}
          variant={sortBy === 'newest' ? 'filled' : 'outlined'}
          onClick={() => { setSortBy('newest'); setPage(1); }}
        />
        <Chip
          label="Most Voted"
          size="small"
          color={sortBy === 'most_voted' ? 'primary' : 'default'}
          variant={sortBy === 'most_voted' ? 'filled' : 'outlined'}
          onClick={() => { setSortBy('most_voted'); setPage(1); }}
        />
      </Stack>

      {/* Questions list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : questions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No questions yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Be the first to share a question from your NATA exam!
          </Typography>
          {user && (
            <Button
              component={Link}
              href="/tools/nata/question-bank/new"
              variant="contained"
            >
              Post a Question
            </Button>
          )}
        </Box>
      ) : (
        <Stack spacing={2}>
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} />
          ))}
        </Stack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: 3 }}>
          <Button
            variant="outlined"
            size="small"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </Button>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
            Page {page} of {totalPages}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </Stack>
      )}

      {/* FAB for mobile */}
      {user && (
        <Box
          component={Link}
          href="/tools/nata/question-bank/new"
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            textDecoration: 'none',
            boxShadow: 4,
            zIndex: 1000,
          }}
        >
          +
        </Box>
      )}
    </Box>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Tabs, Tab, TextField, Skeleton,Grid,
  InputAdornment, Chip, Button, IconButton, useTheme, useMediaQuery,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PendingIcon from '@mui/icons-material/Pending';
import RepeatIcon from '@mui/icons-material/Repeat';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrawingQuestionCard from '@/components/drawings/DrawingQuestionCard';
import FoundationChecklist from '@/components/drawings/FoundationChecklist';
import ObjectLibrary from '@/components/drawings/ObjectLibrary';
import GalleryFeed from '@/components/drawings/GalleryFeed';
import HomeworkList from '@/components/drawings/HomeworkList';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import type { DrawingQuestionEnriched, DrawingAttemptStatus } from '@neram/database/types';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D' },
  { value: '3d_composition', label: '3D' },
  { value: 'kit_sculpture', label: 'Kit' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function StudentDrawingsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [section, setSection] = useState<'questions' | 'foundation' | 'objects' | 'gallery' | 'homework'>('questions');

  const [questions, setQuestions] = useState<DrawingQuestionEnriched[]>([]);
  const [total, setTotal] = useState(0);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (difficulty) params.set('difficulty_tag', difficulty);
      if (year) params.set('year', String(year));
      if (search) params.set('search', search);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/drawing/questions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotal(data.total || 0);
      if (data.available_years) setAvailableYears(data.available_years);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, category, difficulty, year, search, offset]);

  useEffect(() => {
    if (section === 'questions') fetchQuestions();
  }, [fetchQuestions, section]);

  useEffect(() => {
    setOffset(0);
  }, [category, difficulty, year, search]);

  const AttemptStatusIcon = ({ status }: { status: DrawingAttemptStatus }) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />;
      case 'redo':
        return <ReplayIcon sx={{ fontSize: 16, color: 'warning.main' }} />;
      case 'in_progress':
        return <PendingIcon sx={{ fontSize: 16, color: 'info.main' }} />;
      default:
        return <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />;
    }
  };

  // ===================== MOBILE QUESTION LIST ITEM =====================
  const MobileQuestionItem = ({ q }: { q: DrawingQuestionEnriched }) => (
    <Box
      onClick={() => router.push(`/student/drawings/${q.id}`)}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1,
        py: 1, px: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
        cursor: 'pointer',
        '&:active': { bgcolor: 'action.hover' },
      }}
    >
      {/* Question number badge */}
      {q.question_number && (
        <Box sx={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, mt: 0.25,
          bgcolor: 'action.selected', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>
            Q{q.question_number}
          </Typography>
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.25, alignItems: 'center' }}>
          <CategoryBadge category={q.category} />
          <DifficultyChip difficulty={q.difficulty_tag} />
          {q.repeat_count > 1 && (
            <Chip
              icon={<RepeatIcon sx={{ fontSize: 11 }} />}
              label={`x${q.repeat_count}`}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, '& .MuiChip-icon': { ml: 0.25, mr: -0.25 }, '& .MuiChip-label': { px: 0.5 } }}
            />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: '0.68rem', flexShrink: 0 }}>
            {q.year}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500, fontSize: '0.84rem', lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {q.question_text}
        </Typography>
        {q.objects.length > 0 && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25, fontSize: '0.7rem' }}>
            {q.objects.slice(0, 4).join(' \u00B7 ')}{q.objects.length > 4 ? ` +${q.objects.length - 4}` : ''}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mt: 0.5, flexShrink: 0 }}>
        <AttemptStatusIcon status={q.attempt_status} />
      </Box>
    </Box>
  );

  return (
    <Box sx={{
      px: isMobile ? 0 : { sm: 3 },
      py: isMobile ? 0 : 2,
      maxWidth: 1200,
      mx: 'auto',
      ...(isMobile && { mx: { xs: -2, sm: -3 }, mt: -2 }),
    }}>
      {/* Title (desktop only) */}
      {!isMobile && (
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Drawing Practice
        </Typography>
      )}

      {/* Section tabs: text-only on mobile, with icons on desktop */}
      <Tabs
        value={section}
        onChange={(_, v) => setSection(v)}
        variant={isMobile ? 'scrollable' : 'standard'}
        scrollButtons={false}
        sx={{
          mb: isMobile ? 0 : 2,
          minHeight: isMobile ? 36 : 40,
          '& .MuiTab-root': {
            minHeight: isMobile ? 36 : 40,
            py: 0.5,
            px: isMobile ? 1.25 : 2,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: isMobile ? '0.8rem' : undefined,
            minWidth: 0,
          },
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Tab value="questions" label="Questions" {...(!isMobile && { icon: <QuizOutlinedIcon sx={{ fontSize: 16 }} />, iconPosition: 'start' as const })} />
        <Tab value="foundation" label="Foundation" {...(!isMobile && { icon: <ChecklistOutlinedIcon sx={{ fontSize: 16 }} />, iconPosition: 'start' as const })} />
        <Tab value="gallery" label="Gallery" {...(!isMobile && { icon: <CollectionsOutlinedIcon sx={{ fontSize: 16 }} />, iconPosition: 'start' as const })} />
        <Tab value="homework" label="Homework" {...(!isMobile && { icon: <AssignmentOutlinedIcon sx={{ fontSize: 16 }} />, iconPosition: 'start' as const })} />
        <Tab value="objects" label="Objects" {...(!isMobile && { icon: <CategoryOutlinedIcon sx={{ fontSize: 16 }} />, iconPosition: 'start' as const })} />
      </Tabs>

      {/* === Questions Tab === */}
      {section === 'questions' && (
        <Box>
          {/* Year filter chips */}
          {availableYears.length > 1 && (
            <Box sx={{
              display: 'flex', gap: 0.5, px: isMobile ? 1 : 0, py: 0.5,
              overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
              ...(isMobile && { borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fafafa' }),
            }}>
              <Chip
                label="All Years"
                size="small"
                variant={year === '' ? 'filled' : 'outlined'}
                color={year === '' ? 'primary' : 'default'}
                onClick={() => setYear('')}
                sx={{ cursor: 'pointer', height: 26, fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}
              />
              {availableYears.map((y) => (
                <Chip
                  key={y}
                  label={String(y)}
                  size="small"
                  variant={year === y ? 'filled' : 'outlined'}
                  color={year === y ? 'primary' : 'default'}
                  onClick={() => setYear(year === y ? '' : y)}
                  sx={{ cursor: 'pointer', height: 26, fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}
                />
              ))}
            </Box>
          )}

          {/* Filter bar: category chips + difficulty chips + search icon + submissions link */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: isMobile ? 1 : 0,
            py: isMobile ? 0.75 : 1,
            ...(isMobile && { borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fafafa' }),
          }}>
            {/* Category chips */}
            <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', flexShrink: 1, minWidth: 0, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  size="small"
                  variant={category === c.value ? 'filled' : 'outlined'}
                  color={category === c.value ? 'primary' : 'default'}
                  onClick={() => setCategory(c.value)}
                  sx={{ cursor: 'pointer', height: 26, fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}
                />
              ))}
              {/* Divider dot */}
              <Box sx={{ width: 1, bgcolor: 'divider', mx: 0.25, my: 0.5, flexShrink: 0 }} />
              {DIFFICULTIES.map((d) => (
                <Chip
                  key={d}
                  label={d.charAt(0).toUpperCase() + d.slice(1)}
                  size="small"
                  variant={difficulty === d ? 'filled' : 'outlined'}
                  color={difficulty === d ? 'secondary' : 'default'}
                  onClick={() => setDifficulty(difficulty === d ? '' : d)}
                  sx={{ cursor: 'pointer', height: 26, fontSize: '0.72rem', flexShrink: 0 }}
                />
              ))}
            </Box>

            {/* Search icon */}
            <IconButton
              size="small"
              onClick={() => setSearchOpen(!searchOpen)}
              sx={{ flexShrink: 0, p: 0.5 }}
            >
              {searchOpen ? <CloseIcon sx={{ fontSize: 18 }} /> : <SearchIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Box>

          {/* Expandable search bar */}
          {searchOpen && (
            <Box sx={{ px: isMobile ? 1 : 0, py: 0.5, borderBottom: isMobile ? '1px solid' : 'none', borderColor: 'divider' }}>
              <TextField
                placeholder="Search questions..."
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment>,
                }}
                sx={{
                  '& .MuiInputBase-root': { height: 34, fontSize: '0.82rem' },
                }}
              />
            </Box>
          )}

          {/* Count + My Submissions row */}
          <Box sx={{
            display: 'flex', alignItems: 'center',
            px: isMobile ? 1.25 : 0,
            py: 0.5,
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {total} questions
            </Typography>
            <Button
              variant="text"
              size="small"
              onClick={() => router.push('/student/drawings/submissions')}
              sx={{ ml: 'auto', textTransform: 'none', fontSize: '0.72rem', py: 0, minHeight: 0, color: 'primary.main' }}
            >
              My Submissions &rarr;
            </Button>
          </Box>

          {/* Question list/grid */}
          {loading ? (
            isMobile ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={64} sx={{ mx: 1.5, mb: 0.5 }} />
              ))
            ) : (
              <Grid container spacing={1.5}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Grid item xs={6} sm={4} md={3} key={i}>
                    <Skeleton variant="rounded" height={160} />
                  </Grid>
                ))}
              </Grid>
            )
          ) : questions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary" variant="body2">No questions match your filters</Typography>
            </Box>
          ) : (
            <>
              {/* Mobile: single-column list | Desktop: grid */}
              {isMobile ? (
                <Box>
                  {questions.map((q) => (
                    <MobileQuestionItem key={q.id} q={q} />
                  ))}
                </Box>
              ) : (
                <Grid container spacing={1.5}>
                  {questions.map((q) => (
                    <Grid item xs={6} sm={4} md={3} key={q.id}>
                      <DrawingQuestionCard
                        question={q}
                        questionNumber={q.question_number}
                        repeatCount={q.repeat_count}
                        attemptStatus={q.attempt_status}
                        onClick={() => router.push(`/student/drawings/${q.id}`)}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
              {questions.length < total && (
                <Box sx={{ textAlign: 'center', mt: 2, pb: isMobile ? 8 : 0 }}>
                  <Button
                    variant="outlined"
                    size={isMobile ? 'small' : 'medium'}
                    onClick={() => setOffset((prev) => prev + limit)}
                    sx={{ textTransform: 'none' }}
                  >
                    Load more
                  </Button>
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* === Foundation Tab === */}
      {section === 'foundation' && (
        <Box sx={{ px: isMobile ? 1 : 0 }}>
          <FoundationChecklist getToken={getToken} />
        </Box>
      )}

      {/* === Objects Tab === */}
      {section === 'objects' && (
        <Box sx={{ px: isMobile ? 1 : 0 }}>
          <ObjectLibrary getToken={getToken} />
        </Box>
      )}

      {/* === Gallery Tab === */}
      {section === 'gallery' && (
        <Box sx={{ px: isMobile ? 1 : 0 }}>
          <GalleryFeed getToken={getToken} />
        </Box>
      )}

      {/* === Homework Tab === */}
      {section === 'homework' && (
        <Box sx={{ px: isMobile ? 1 : 0 }}>
          <HomeworkList getToken={getToken} />
        </Box>
      )}
    </Box>
  );
}

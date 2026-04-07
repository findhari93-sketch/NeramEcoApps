'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Tabs, Tab, TextField, Skeleton, Grid,
  InputAdornment, Chip, Button,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrawingQuestionCard from '@/components/drawings/DrawingQuestionCard';
import FoundationChecklist from '@/components/drawings/FoundationChecklist';
import ObjectLibrary from '@/components/drawings/ObjectLibrary';
import GalleryFeed from '@/components/drawings/GalleryFeed';
import HomeworkList from '@/components/drawings/HomeworkList';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import type { DrawingQuestion } from '@neram/database/types';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D Composition' },
  { value: '3d_composition', label: '3D Objects' },
  { value: 'kit_sculpture', label: 'Kit / Sculpture' },
];

const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function StudentDrawingsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  // Top-level section: questions | foundation | objects
  const [section, setSection] = useState<'questions' | 'foundation' | 'objects' | 'gallery' | 'homework'>('questions');

  // Question bank state
  const [questions, setQuestions] = useState<DrawingQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (difficulty) params.set('difficulty_tag', difficulty);
      if (search) params.set('search', search);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/drawing/questions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotal(data.total || 0);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, category, difficulty, search, offset]);

  useEffect(() => {
    if (section === 'questions') fetchQuestions();
  }, [fetchQuestions, section]);

  useEffect(() => {
    setOffset(0);
  }, [category, difficulty, search]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Drawing Practice
      </Typography>

      {/* Top-level section tabs */}
      <Tabs
        value={section}
        onChange={(_, v) => setSection(v)}
        sx={{
          mb: 2, minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, py: 0.75, textTransform: 'none', fontWeight: 600 },
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Tab value="questions" icon={<QuizOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Questions" />
        <Tab value="foundation" icon={<ChecklistOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Foundation" />
        <Tab value="objects" icon={<CategoryOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Objects" />
        <Tab value="gallery" icon={<CollectionsOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Gallery" />
        <Tab value="homework" icon={<AssignmentOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Homework" />
      </Tabs>

      {/* === Questions Tab === */}
      {section === 'questions' && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {total} NATA drawing questions to practice
          </Typography>

          <Tabs
            value={category}
            onChange={(_, v) => setCategory(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 1.5, minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.25, textTransform: 'none', fontSize: '0.85rem' } }}
          >
            {CATEGORIES.map((c) => (
              <Tab key={c.value} value={c.value} label={c.label} />
            ))}
          </Tabs>

          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              placeholder="Search questions..."
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>
                ),
              }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {DIFFICULTIES.map((d) => (
                <Chip
                  key={d}
                  label={d.charAt(0).toUpperCase() + d.slice(1)}
                  size="small"
                  variant={difficulty === d ? 'filled' : 'outlined'}
                  color={difficulty === d ? 'primary' : 'default'}
                  onClick={() => setDifficulty(difficulty === d ? '' : d)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>

          <Button
            variant="text"
            size="small"
            onClick={() => router.push('/student/drawings/submissions')}
            sx={{ mb: 2, textTransform: 'none' }}
          >
            View My Submissions &rarr;
          </Button>

          {loading ? (
            <Grid container spacing={1.5}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Grid item xs={6} sm={4} md={3} key={i}>
                  <Skeleton variant="rounded" height={160} />
                </Grid>
              ))}
            </Grid>
          ) : questions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary">No questions match your filters</Typography>
            </Box>
          ) : (
            <>
              <Grid container spacing={1.5}>
                {questions.map((q) => (
                  <Grid item xs={6} sm={4} md={3} key={q.id}>
                    <DrawingQuestionCard
                      question={q}
                      onClick={() => router.push(`/student/drawings/${q.id}`)}
                    />
                  </Grid>
                ))}
              </Grid>
              {questions.length < total && (
                <Box sx={{ textAlign: 'center', mt: 3 }}>
                  <Button
                    variant="outlined"
                    onClick={() => setOffset((prev) => prev + limit)}
                    sx={{ textTransform: 'none' }}
                  >
                    Load more
                  </Button>
                </Box>
              )}
            </>
          )}
        </>
      )}

      {/* === Foundation Tab === */}
      {section === 'foundation' && (
        <FoundationChecklist getToken={getToken} />
      )}

      {/* === Objects Tab === */}
      {section === 'objects' && (
        <ObjectLibrary getToken={getToken} />
      )}

      {/* === Gallery Tab === */}
      {section === 'gallery' && (
        <GalleryFeed getToken={getToken} />
      )}

      {/* === Homework Tab === */}
      {section === 'homework' && (
        <HomeworkList getToken={getToken} />
      )}
    </Box>
  );
}

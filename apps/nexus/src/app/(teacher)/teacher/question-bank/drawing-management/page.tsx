'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Chip, Button, Paper, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Skeleton, useTheme, useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import LinkIcon from '@mui/icons-material/Link';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';

interface DrawingQBQuestion {
  id: string;
  question_text: string;
  difficulty: string;
  categories: string[];
  solution_image_url: string | null;
  solution_video_url: string | null;
  objects_to_include: Array<{ name: string }> | null;
  colour_constraint: string | null;
  design_principle_tested: string | null;
  drawing_question_id: string | null;
  year: number | null;
  question_number: number | null;
}

export default function DrawingManagementPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [questions, setQuestions] = useState<DrawingQBQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearTab, setYearTab] = useState<string>('all');
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Solution upload dialog state
  const [solutionDialog, setSolutionDialog] = useState<{ open: boolean; questionId: string; currentUrl: string }>({
    open: false, questionId: '', currentUrl: '',
  });
  const [solutionUrl, setSolutionUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ format: 'DRAWING_PROMPT' });
      if (yearTab !== 'all') params.set('year', yearTab);

      const res = await fetch(`/api/question-bank/drawing-management?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQuestions(data.questions || []);
      if (data.available_years) setAvailableYears(data.available_years);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, yearTab]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const handleSaveSolution = async () => {
    if (!solutionUrl.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`/api/question-bank/questions/${solutionDialog.questionId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ solution_image_url: solutionUrl.trim() }),
      });
      setSolutionDialog({ open: false, questionId: '', currentUrl: '' });
      setSolutionUrl('');
      fetchQuestions();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const getCategoryFromCategories = (cats: string[]): string => {
    if (cats.includes('3d_composition')) return '3d_composition';
    if (cats.includes('kit_sculpture')) return 'kit_sculpture';
    return '2d_composition';
  };

  return (
    <Box sx={{ px: isMobile ? 1 : 3, py: 2, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/teacher/question-bank')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <BrushOutlinedIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>Drawing Questions</Typography>
        <Chip label={`${questions.length} questions`} size="small" sx={{ ml: 'auto' }} />
      </Box>

      {/* Year tabs */}
      <Tabs
        value={yearTab}
        onChange={(_, v) => setYearTab(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' } }}
      >
        <Tab value="all" label="All Years" />
        {availableYears.map((y) => (
          <Tab key={y} value={String(y)} label={String(y)} />
        ))}
      </Tabs>

      {/* Actions bar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => router.push('/teacher/question-bank/bulk-upload')}
          sx={{ textTransform: 'none' }}
        >
          Bulk Upload Drawing Questions
        </Button>
      </Box>

      {/* Question list */}
      {loading ? (
        Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={80} sx={{ mb: 1, borderRadius: 1 }} />
        ))
      ) : questions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No drawing questions found for this year</Typography>
        </Paper>
      ) : (
        questions.map((q) => (
          <Paper
            key={q.id}
            variant="outlined"
            sx={{ p: 1.5, mb: 1, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
          >
            {/* Question number */}
            <Box sx={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              bgcolor: 'action.selected', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}>
                {q.question_number ? `Q${q.question_number}` : '?'}
              </Typography>
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <CategoryBadge category={getCategoryFromCategories(q.categories)} />
                <DifficultyChip difficulty={q.difficulty.toLowerCase()} />
                {q.year && <Chip label={String(q.year)} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />}
                {q.drawing_question_id && (
                  <Chip
                    icon={<LinkIcon sx={{ fontSize: 12 }} />}
                    label="Linked"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { ml: 0.25 } }}
                  />
                )}
              </Box>
              <Typography variant="body2" sx={{
                fontWeight: 500, fontSize: '0.82rem', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {q.question_text}
              </Typography>
              {q.objects_to_include && q.objects_to_include.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  Objects: {q.objects_to_include.map((o) => o.name).join(', ')}
                </Typography>
              )}
            </Box>

            {/* Solution status + action */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              {q.solution_image_url ? (
                <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
              ) : (
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => {
                    setSolutionDialog({ open: true, questionId: q.id, currentUrl: q.solution_image_url || '' });
                    setSolutionUrl(q.solution_image_url || '');
                  }}
                  title="Add solution image"
                >
                  <ImageOutlinedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              )}
              <Typography variant="caption" sx={{ fontSize: '0.55rem', color: q.solution_image_url ? 'success.main' : 'text.disabled' }}>
                {q.solution_image_url ? 'Solution' : 'No solution'}
              </Typography>
            </Box>
          </Paper>
        ))
      )}

      {/* Solution URL dialog */}
      <Dialog open={solutionDialog.open} onClose={() => setSolutionDialog({ open: false, questionId: '', currentUrl: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Add Solution Image URL</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Solution Image URL"
            placeholder="https://..."
            value={solutionUrl}
            onChange={(e) => setSolutionUrl(e.target.value)}
            sx={{ mt: 1 }}
          />
          {solutionUrl && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">Preview:</Typography>
              <Box
                component="img"
                src={solutionUrl}
                alt="Solution preview"
                sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider', mt: 0.5 }}
                onError={(e: any) => { e.target.style.display = 'none'; }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSolutionDialog({ open: false, questionId: '', currentUrl: '' })}>Cancel</Button>
          <Button onClick={handleSaveSolution} variant="contained" disabled={saving || !solutionUrl.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

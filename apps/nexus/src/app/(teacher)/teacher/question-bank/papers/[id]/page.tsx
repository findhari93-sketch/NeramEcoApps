'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  Alert,
  IconButton,
  Tabs,
  Tab,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TranslateIcon from '@mui/icons-material/Translate';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  QB_EXAM_TYPE_LABELS,
  QB_CATEGORY_LABELS,
} from '@neram/database';
import type { NexusQBOriginalPaper, NexusQBQuestion } from '@neram/database';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import PaperProgressBar from '@/components/question-bank/PaperProgressBar';
import AnswerKeyGrid from '@/components/question-bank/AnswerKeyGrid';
import { questionNeedsImage, questionMissingImages } from '@/components/question-bank/AnswerKeyGrid';
import HindiMergeDialog from '@/components/question-bank/HindiMergeDialog';
import BulkImageManager from '@/components/question-bank/BulkImageManager';
import InlineQuestionEditor from '@/components/question-bank/InlineQuestionEditor';
import BulkVideoLinksDialog from '@/components/question-bank/BulkVideoLinksDialog';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

export default function PaperDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paperId = params.id as string;
  const { getToken } = useNexusAuthContext();

  const [paper, setPaper] = useState<NexusQBOriginalPaper | null>(null);
  const [questions, setQuestions] = useState<NexusQBQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [hindiMergeOpen, setHindiMergeOpen] = useState(false);
  const [videoLinksOpen, setVideoLinksOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const fetchData = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPaper(json.data.paper);
        setQuestions(json.data.questions);
      }
    } catch (err) {
      console.error('Failed to fetch paper:', err);
    } finally {
      if (!background) setLoading(false);
    }
  }, [paperId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveAnswers = async (
    answers: { question_number: number; correct_answer: string }[]
  ) => {
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/answer-key`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Answers saved');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to save answers');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Questions activated');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to activate');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        setMessage(json.message || 'Questions deactivated');
        await fetchData();
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to deactivate');
    } finally {
      setDeactivating(false);
    }
  };

  const handleDelete = async () => {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok) {
        router.push('/teacher/question-bank/papers');
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage('Failed to delete paper');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getCategoryLabel = (cat: string) =>
    QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS] || cat;

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!paper) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
        <Alert severity="error">Paper not found</Alert>
      </Box>
    );
  }

  const total = paper.questions_parsed || 0;
  const keyed = paper.questions_answer_keyed || 0;
  const complete = paper.questions_complete || 0;
  const draft = total - keyed;
  const answerKeyedOnly = keyed - complete;
  const completeCount = questions.filter((q) => q.status === 'complete' || q.status === 'answer_keyed').length;
  const activeCount = questions.filter((q) => q.status === 'active' && q.is_active).length;
  const shiftSuffix = paper.shift ? ` (${paper.shift === 'forenoon' ? 'Forenoon' : 'Afternoon'})` : '';
  const paperLabel = `${QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type} ${paper.year}${paper.session ? ` ${paper.session}` : ''}${shiftSuffix}`;
  const needsImageCount = questions.filter(questionNeedsImage).length;
  // Count questions that need images AND are still missing some
  const missingAnyImageCount = questions.filter(questionMissingImages).length;

  // Section breakdown
  const sectionBreakdown: Record<string, number> = {};
  for (const q of questions) {
    const cats = q.categories as string[] | null;
    if (cats && cats.length > 0) {
      for (const cat of cats) {
        sectionBreakdown[cat] = (sectionBreakdown[cat] || 0) + 1;
      }
    } else {
      const fmt = q.question_format || 'OTHER';
      sectionBreakdown[fmt] = (sectionBreakdown[fmt] || 0) + 1;
    }
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank/papers')}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
              size="small"
              color="primary"
            />
            <Typography variant="h6" fontWeight={700}>
              {paper.year}
            </Typography>
            {paper.session && (
              <Chip
                label={paper.shift
                  ? `${paper.session} (${paper.shift === 'forenoon' ? 'FN' : 'AN'})`
                  : paper.session}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            Uploaded {formatDate(paper.created_at)}
          </Typography>
        </Box>
      </Box>

      {/* Progress */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <PaperProgressBar
          total={total}
          draft={draft > 0 ? draft : 0}
          answerKeyed={answerKeyedOnly > 0 ? answerKeyedOnly : 0}
          complete={complete - activeCount > 0 ? complete - activeCount : 0}
          active={activeCount}
          showLabels
        />
        <Typography variant="body2" sx={{ mt: 1 }}>
          {total} total &middot; {keyed} with answers &middot; {complete} complete{activeCount > 0 ? ` \u00b7 ${activeCount} active` : ''}
        </Typography>
        {needsImageCount > 0 && (
          <Chip
            icon={<ImageNotSupportedOutlinedIcon sx={{ fontSize: 14 }} />}
            label={`${needsImageCount} need images`}
            size="small"
            sx={{
              mt: 1,
              bgcolor: '#F59E0B20',
              color: '#D97706',
              fontWeight: 600,
              fontSize: '0.75rem',
              '& .MuiChip-icon': { color: '#D97706' },
            }}
          />
        )}

        {/* Section breakdown */}
        {Object.keys(sectionBreakdown).length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
            {Object.entries(sectionBreakdown).map(([cat, count]) => (
              <Chip
                key={cat}
                label={`${getCategoryLabel(cat)}: ${count}`}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.65rem' }}
              />
            ))}
          </Box>
        )}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          {completeCount > 0 && (
            <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={<PlayArrowIcon />}
              onClick={handleActivate}
              disabled={activating}
            >
              {activating ? 'Activating...' : `Activate ${completeCount}`}
            </Button>
          )}
          {activeCount > 0 && (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              startIcon={<VisibilityOffOutlinedIcon />}
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              {deactivating ? 'Deactivating...' : `Deactivate ${activeCount}`}
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentPasteIcon />}
            onClick={() => setVideoLinksOpen(true)}
            sx={{ borderColor: '#7c3aed', color: '#7c3aed', '&:hover': { borderColor: '#6d28d9', bgcolor: 'rgba(124, 58, 237, 0.04)' } }}
          >
            Paste Video Links
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<TranslateIcon />}
            onClick={() => setHindiMergeOpen(true)}
            sx={{ borderColor: '#e65100', color: '#e65100', '&:hover': { borderColor: '#bf360c', bgcolor: 'rgba(230, 81, 0, 0.04)' } }}
          >
            Upload Hindi
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Paper'}
          </Button>
        </Box>
      </Paper>

      {message && (
        <Alert
          severity={message.startsWith('Error') ? 'error' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setMessage('')}
        >
          {message}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="Answer Key" />
        <Tab label={`Questions (${questions.length})`} />
        <Tab
          label={`Bulk Images${missingAnyImageCount > 0 ? ` (${missingAnyImageCount})` : ''}`}
          icon={<CollectionsOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ minHeight: 48 }}
        />
      </Tabs>

      {/* Tab: Answer Key */}
      {tab === 0 && (
        <AnswerKeyGrid questions={questions} onSave={handleSaveAnswers} saving={saving} />
      )}

      {/* Tab: Questions List (Inline Editing) */}
      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {questions.map((q, i) => (
            <InlineQuestionEditor
              key={q.id}
              question={q}
              expanded={expandedQuestionId === q.id}
              onToggle={() =>
                setExpandedQuestionId((prev) => (prev === q.id ? null : q.id))
              }
              getToken={getToken}
              onSaved={() => fetchData(true)}
              index={i}
            />
          ))}
        </Box>
      )}

      {/* Tab: Bulk Images */}
      {tab === 2 && (
        <BulkImageManager
          questions={questions}
          paperId={paperId}
          getToken={getToken}
          onQuestionsUpdated={() => fetchData(true)}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Paper?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{paperLabel}</strong> and all {total} questions.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hindi merge dialog */}
      <HindiMergeDialog
        open={hindiMergeOpen}
        onClose={() => setHindiMergeOpen(false)}
        paperId={paperId}
        questions={questions}
        getToken={getToken}
        onSuccess={() => {
          setMessage('Hindi text merged successfully');
          fetchData(true);
        }}
      />

      {/* Bulk video links dialog */}
      <BulkVideoLinksDialog
        open={videoLinksOpen}
        onClose={() => setVideoLinksOpen(false)}
        questions={questions}
        paperId={paperId}
        getToken={getToken}
        onSuccess={(msg) => {
          setMessage(msg);
          fetchData(true);
        }}
      />
    </Box>
  );
}
